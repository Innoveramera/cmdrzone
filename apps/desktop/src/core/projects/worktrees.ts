// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Git-worktree support — the "parallel agents" primitive. Each worktree is an isolated
// checkout on its own `cz/<name>` branch, living OUTSIDE the scan tree (a dot-folder sibling
// of the repo: <parent>/.cz-worktrees/<repo>/<name>), so the scanner never double-discovers
// it. Discovery is derived from `git worktree list` (git is the source of truth — no extra
// state to migrate or desync), and worktree nodes are attached as children of their project.
// All calls are sync (execFileSync) and only run for repos whose .cz-worktrees dir exists,
// so a normal scan pays one existsSync per project and nothing more.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ProjectNode, WorktreeOpResult } from '@shared/types'
import { readMarkers, makeNode } from './scanner'

export interface WorktreeInfo {
  path: string
  name: string
  branch: string
}

/** Where a repo's CmdrZone worktrees live: a dot-dir sibling, invisible to the scanner. */
export function worktreeBase(repoPath: string): string {
  return path.join(path.dirname(repoPath), '.cz-worktrees', path.basename(repoPath))
}

function git(
  repo: string,
  args: string[],
  env: NodeJS.ProcessEnv
): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync('git', ['-C', repo, ...args], {
      env,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { ok: true, out, err: '' }
  } catch (e) {
    const anyErr = e as { stderr?: string | Buffer; message?: string }
    const err = (anyErr.stderr?.toString() || anyErr.message || 'git failed').trim()
    return { ok: false, out: '', err }
  }
}

/** CmdrZone-managed worktrees of a repo (empty if none — checked with a single existsSync). */
export function listWorktrees(repoPath: string, env: NodeJS.ProcessEnv): WorktreeInfo[] {
  const base = worktreeBase(repoPath)
  if (!fs.existsSync(base)) return []
  const r = git(repoPath, ['worktree', 'list', '--porcelain'], env)
  if (!r.ok) return []
  const out: WorktreeInfo[] = []
  let cur: { path?: string; branch?: string } = {}
  const flush = (): void => {
    if (cur.path && cur.path.startsWith(base + path.sep)) {
      out.push({ path: cur.path, name: path.basename(cur.path), branch: cur.branch ?? '(detached)' })
    }
    cur = {}
  }
  for (const line of r.out.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      cur = { path: line.slice('worktree '.length).trim() }
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    }
  }
  flush()
  return out
}

/** Attach each project's live worktrees as child nodes (recurses through group children). */
export function attachWorktrees(nodes: ProjectNode[], env: NodeJS.ProcessEnv): void {
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (n.children) attachWorktrees(n.children, env)
      continue
    }
    if (n.kind !== 'project' || n.worktreeOf) continue
    const wts = listWorktrees(n.path, env)
    if (!wts.length) continue
    n.children = wts.map((w) => {
      const node = makeNode(w.path, w.name, 'project', readMarkers(w.path))
      node.parentPath = n.path
      node.worktreeOf = n.path
      node.branch = w.branch
      node.type = n.type
      node.color = n.color
      return node
    })
  }
}

/** `git worktree add -b cz/<slug>` under .cz-worktrees. Fails cleanly if name/branch is taken. */
export function addWorktree(
  repoPath: string,
  rawName: string,
  env: NodeJS.ProcessEnv
): WorktreeOpResult {
  const slug = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
  if (!slug) return { ok: false, error: 'Give the worktree a name (letters/digits/dashes).' }
  const wtPath = path.join(worktreeBase(repoPath), slug)
  if (fs.existsSync(wtPath)) return { ok: false, error: `Worktree "${slug}" already exists.` }
  const branch = `cz/${slug}`
  try {
    fs.mkdirSync(path.dirname(wtPath), { recursive: true })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const r = git(repoPath, ['worktree', 'add', '-b', branch, wtPath], env)
  if (!r.ok) return { ok: false, error: r.err }
  return { ok: true, path: wtPath, branch }
}

/**
 * Remove a worktree and delete its cz/ branch. `git worktree remove --force` because the
 * caller has already confirmed that unmerged/uncommitted work is discarded; the branch delete
 * is best-effort (already gone / checked out elsewhere is fine).
 */
export function removeWorktree(
  repoPath: string,
  wtPath: string,
  env: NodeJS.ProcessEnv
): WorktreeOpResult {
  const wt = listWorktrees(repoPath, env).find((w) => w.path === wtPath)
  const r = git(repoPath, ['worktree', 'remove', '--force', wtPath], env)
  if (!r.ok) return { ok: false, error: r.err }
  if (wt && wt.branch !== '(detached)') git(repoPath, ['branch', '-D', wt.branch], env)
  return { ok: true }
}

/**
 * Merge the worktree's branch into the main repo's current branch, then remove the worktree.
 * Requires both checkouts clean (a conflicted merge is aborted and reported, never left
 * half-done for the user to discover later).
 */
export function mergeWorktree(
  repoPath: string,
  wtPath: string,
  env: NodeJS.ProcessEnv
): WorktreeOpResult {
  const wt = listWorktrees(repoPath, env).find((w) => w.path === wtPath)
  if (!wt) return { ok: false, error: 'Worktree not found.' }
  if (wt.branch === '(detached)') return { ok: false, error: 'Worktree is on a detached HEAD.' }
  const wtStatus = git(wtPath, ['status', '--porcelain'], env)
  if (!wtStatus.ok) return { ok: false, error: wtStatus.err }
  if (wtStatus.out.trim()) {
    return { ok: false, error: 'The worktree has uncommitted changes — commit them first (ask the agent!).' }
  }
  const mainStatus = git(repoPath, ['status', '--porcelain'], env)
  if (!mainStatus.ok) return { ok: false, error: mainStatus.err }
  if (mainStatus.out.trim()) {
    return { ok: false, error: 'The main project has uncommitted changes — commit or stash them before merging.' }
  }
  const m = git(repoPath, ['merge', wt.branch], env)
  if (!m.ok) {
    git(repoPath, ['merge', '--abort'], env)
    return { ok: false, error: `Merge failed (aborted): ${m.err}` }
  }
  return removeWorktree(repoPath, wtPath, env)
}
