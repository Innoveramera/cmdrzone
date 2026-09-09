// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Working-tree snapshots + checkpoints — the primitive behind "what did the agent change?".
//
// A snapshot is a git *tree* of the working tree as it is right now, untracked files
// included and .gitignore respected. It's built against a throwaway copy of the index
// (GIT_INDEX_FILE), so the user's real index, HEAD and branch are never touched. A
// checkpoint is such a snapshot turned into a dangling commit and pinned by a hidden ref,
// `refs/cz/cp/<terminalId>/<seq>`, which:
//   - survives app restarts (lives in .git, like the tmux session it belongs to),
//   - is shared across the repo's worktrees (refs are common),
//   - never shows up in `git log`, branches or pushes,
//   - can be diffed with plain `git diff <a> <b>` and reverted with `git restore --source`.
// No electron imports (main-safe core).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Checkpoint, CheckpointRevertResult } from '@shared/git'
import { git } from './run'

const REF_BASE = 'refs/cz/cp'

/** Only terminal ids of our own shape become ref names (defensive — ids are `term-<n>-<ts>`). */
function safeId(id: string): string | null {
  return /^[A-Za-z0-9._-]{1,80}$/.test(id) ? id : null
}

/**
 * Snapshot the working tree into a tree object. Returns the tree sha, or null when this is
 * not a git repo / git failed. Cost ≈ one `git add -A` against a scratch index.
 */
export async function snapshotTree(repo: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const idx = await git(repo, ['rev-parse', '--git-path', 'index'], env)
  if (!idx.ok) return null
  const indexPath = path.resolve(repo, idx.out.trim())
  const scratch = path.join(os.tmpdir(), `cz-index-${randomUUID()}`)
  try {
    // Copy the real index so the scratch one starts with the same tracked set (fast, and it
    // keeps stat info so `add -A` only hashes what actually changed). A missing index (fresh
    // repo) is fine — `add -A` builds it from scratch.
    try {
      fs.copyFileSync(indexPath, scratch)
    } catch {
      /* no index yet */
    }
    const envOverride = { GIT_INDEX_FILE: scratch }
    const add = await git(repo, ['add', '-A', '--ignore-errors', '--', '.'], env, { envOverride, timeout: 60_000 })
    if (!add.ok) return null
    const wt = await git(repo, ['write-tree'], env, { envOverride })
    if (!wt.ok) return null
    return wt.out.trim() || null
  } finally {
    try {
      fs.unlinkSync(scratch)
    } catch {
      /* already gone */
    }
  }
}

/** Parse `for-each-ref` output for our checkpoint namespace. */
function parseRefs(out: string): Checkpoint[] {
  const list: Checkpoint[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    // <refname>\t<sha>\t<unix>\t<subject>
    const [ref, sha, unix, ...rest] = line.split('\t')
    if (!ref || !sha) continue
    const m = new RegExp(`^${REF_BASE}/([^/]+)/(\\d+)$`).exec(ref)
    if (!m) continue
    list.push({
      ref,
      sha,
      terminalId: m[1]!,
      seq: parseInt(m[2]!, 10),
      at: (parseInt(unix ?? '0', 10) || 0) * 1000,
      label: (rest.join('\t') || '').replace(/^cz checkpoint:\s*/, '') || 'turn'
    })
  }
  return list.sort((a, b) => a.at - b.at || a.seq - b.seq)
}

/** All checkpoints in the repo (every terminal), oldest first. */
export async function listCheckpoints(repo: string, env: NodeJS.ProcessEnv): Promise<Checkpoint[]> {
  const r = await git(
    repo,
    ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(creatordate:unix)%09%(subject)', `${REF_BASE}/`],
    env
  )
  return r.ok ? parseRefs(r.out) : []
}

/**
 * Take a checkpoint for a terminal. `label` is 'start' when the agent session begins and
 * 'turn' after each finished turn. Skips (returns null) when the tree is identical to the
 * previous checkpoint — a turn that changed nothing isn't worth a ref.
 */
export async function createCheckpoint(
  repo: string,
  terminalId: string,
  label: 'start' | 'turn',
  env: NodeJS.ProcessEnv
): Promise<Checkpoint | null> {
  const id = safeId(terminalId)
  if (!id) return null
  const tree = await snapshotTree(repo, env)
  if (!tree) return null
  const existing = (await listCheckpoints(repo, env)).filter((c) => c.terminalId === id)
  const last = existing[existing.length - 1]
  if (last) {
    const lastTree = await git(repo, ['rev-parse', `${last.sha}^{tree}`], env)
    if (lastTree.ok && lastTree.out.trim() === tree) return null
  }
  const seq = last ? last.seq + 1 : 0
  const head = await git(repo, ['rev-parse', '--verify', '-q', 'HEAD'], env)
  const parentArgs = head.ok && head.out.trim() ? ['-p', head.out.trim()] : []
  const commit = await git(
    repo,
    ['commit-tree', tree, ...parentArgs, '-m', `cz checkpoint: ${label}`],
    env,
    {
      envOverride: {
        GIT_AUTHOR_NAME: 'CmdrZone',
        GIT_AUTHOR_EMAIL: 'cmdrzone@localhost',
        GIT_COMMITTER_NAME: 'CmdrZone',
        GIT_COMMITTER_EMAIL: 'cmdrzone@localhost'
      }
    }
  )
  if (!commit.ok) return null
  const sha = commit.out.trim()
  const ref = `${REF_BASE}/${id}/${seq}`
  const upd = await git(repo, ['update-ref', ref, sha], env)
  if (!upd.ok) return null
  return { ref, sha, terminalId: id, seq, at: Date.now(), label }
}

/** Delete every checkpoint ref of a terminal (the tab was closed for good). */
export async function dropCheckpoints(repo: string, terminalId: string, env: NodeJS.ProcessEnv): Promise<void> {
  const id = safeId(terminalId)
  if (!id) return
  const list = (await listCheckpoints(repo, env)).filter((c) => c.terminalId === id)
  for (const c of list) await git(repo, ['update-ref', '-d', c.ref], env)
}

/**
 * Remove checkpoints whose terminal no longer exists (tabs that died with a non-durable
 * session, or before this feature knew to clean up). `live` = terminal ids still open.
 */
export async function pruneCheckpoints(repo: string, live: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const keep = new Set(live)
  const list = await listCheckpoints(repo, env)
  let n = 0
  for (const c of list) {
    if (keep.has(c.terminalId)) continue
    const r = await git(repo, ['update-ref', '-d', c.ref], env)
    if (r.ok) n++
  }
  return n
}

/**
 * Put the working tree back to what a checkpoint captured: tracked files are restored from
 * the checkpoint's tree, and files that only exist now (added since) are deleted. The index
 * is restored too so a following commit sees exactly the checkpoint state. The caller
 * confirms with the user first — this discards work.
 */
export async function revertToCheckpoint(
  repo: string,
  ref: string,
  env: NodeJS.ProcessEnv
): Promise<CheckpointRevertResult> {
  if (!ref.startsWith(`${REF_BASE}/`)) return { ok: false, error: 'Not a CmdrZone checkpoint.' }
  const ok = await git(repo, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], env)
  if (!ok.ok) return { ok: false, error: 'Checkpoint no longer exists.' }
  // Files present now but absent in the checkpoint → delete (a fresh snapshot tells us which).
  const now = await snapshotTree(repo, env)
  if (now) {
    const added = await git(repo, ['diff', '--name-only', '--diff-filter=A', '-z', ref, now], env)
    if (added.ok) {
      for (const p of added.out.split('\0')) {
        if (!p) continue
        try {
          fs.rmSync(path.join(repo, p), { force: true })
        } catch {
          /* best effort */
        }
      }
    }
  }
  const restore = await git(repo, ['restore', '--source', ref, '--worktree', '--staged', '--', '.'], env, {
    timeout: 60_000
  })
  if (!restore.ok) return { ok: false, error: restore.err }
  return { ok: true }
}
