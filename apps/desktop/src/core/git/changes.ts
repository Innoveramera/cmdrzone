// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Change listing + per-file diffs for the Changes tab. Both sides of every comparison are
// trees: the base (HEAD, or a checkpoint commit) and a fresh working-tree snapshot (see
// snapshot.ts) — which is what makes untracked files show up like any other addition, and
// what lets "since the agent started" and "uncommitted" share one code path.
// No electron imports (main-safe core).

import type { ChangeSet, ChangedFile, ChangeStatus, FileDiff } from '@shared/git'
import { git } from './run'
import { snapshotTree } from './snapshot'

const MAX_DIFF_CHARS = 2 * 1024 * 1024

function parseNameStatus(out: string): Map<string, { status: ChangeStatus; oldPath?: string }> {
  const map = new Map<string, { status: ChangeStatus; oldPath?: string }>()
  // -z output: STATUS\0path\0 (renames/copies: STATUS<score>\0old\0new\0)
  const parts = out.split('\0')
  let i = 0
  while (i < parts.length) {
    const st = parts[i++]
    if (!st) continue
    const code = st[0] as string
    if (code === 'R' || code === 'C') {
      const oldPath = parts[i++] ?? ''
      const newPath = parts[i++] ?? ''
      if (newPath) map.set(newPath, { status: 'R', oldPath })
    } else {
      const p = parts[i++] ?? ''
      if (!p) continue
      const status: ChangeStatus = code === 'A' ? 'A' : code === 'D' ? 'D' : code === 'T' ? 'T' : 'M'
      map.set(p, { status })
    }
  }
  return map
}

/**
 * List what changed between `base` (a ref/sha; 'HEAD' = uncommitted work) and the working
 * tree right now. Returns the snapshot tree too, so file diffs can be read from exactly the
 * state that was listed.
 */
export async function listChanges(repo: string, base: string, env: NodeJS.ProcessEnv): Promise<ChangeSet> {
  const tree = await snapshotTree(repo, env)
  if (!tree) return { base, tree: '', files: [] }
  // Fresh repo without commits: compare against the empty tree so everything reads as added.
  let baseRef = base
  if (base === 'HEAD') {
    const head = await git(repo, ['rev-parse', '--verify', '-q', 'HEAD'], env)
    if (!head.ok || !head.out.trim()) {
      const empty = await git(repo, ['hash-object', '-t', 'tree', '/dev/null'], env)
      baseRef = empty.ok ? empty.out.trim() : base
    }
  }
  const [numstat, names] = await Promise.all([
    git(repo, ['diff', '--numstat', '-M', '-z', baseRef, tree], env),
    git(repo, ['diff', '--name-status', '-M', '-z', baseRef, tree], env)
  ])
  if (!numstat.ok || !names.ok) return { base, tree, files: [] }
  const statusMap = parseNameStatus(names.out)
  const files: ChangedFile[] = []
  // numstat -z: "added\tdeleted\tpath\0" — renames: "added\tdeleted\0old\0new\0"
  const parts = numstat.out.split('\0')
  let i = 0
  while (i < parts.length) {
    const rec = parts[i++]
    if (!rec) continue
    const [a, d, inline] = rec.split('\t')
    let p = inline ?? ''
    let oldPath: string | undefined
    if (!p) {
      oldPath = parts[i++] ?? ''
      p = parts[i++] ?? ''
    }
    if (!p) continue
    const binary = a === '-' || d === '-'
    const st = statusMap.get(p)
    files.push({
      path: p,
      oldPath: st?.oldPath ?? oldPath,
      status: st?.status ?? (oldPath ? 'R' : 'M'),
      added: binary ? 0 : parseInt(a ?? '0', 10) || 0,
      deleted: binary ? 0 : parseInt(d ?? '0', 10) || 0,
      binary
    })
  }
  files.sort((x, y) => x.path.localeCompare(y.path))
  return { base: baseRef, tree, files }
}

async function readBlob(repo: string, treeish: string, p: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const r = await git(repo, ['show', `${treeish}:${p}`], env)
  if (!r.ok) return null
  if (r.out.length > MAX_DIFF_CHARS) return r.out.slice(0, MAX_DIFF_CHARS) + '\n…(truncated)\n'
  return r.out
}

/** Both sides of a file for the diff editor. A missing side (added/deleted) reads as ''. */
export async function fileDiff(
  repo: string,
  base: string,
  tree: string,
  file: Pick<ChangedFile, 'path' | 'oldPath' | 'binary'>,
  env: NodeJS.ProcessEnv
): Promise<FileDiff> {
  if (file.binary) return { original: '', modified: '', binary: true }
  const [original, modified] = await Promise.all([
    readBlob(repo, base, file.oldPath ?? file.path, env),
    readBlob(repo, tree, file.path, env)
  ])
  return { original: original ?? '', modified: modified ?? '', binary: false }
}

/** The unified patch text between base and tree (for the message generator). */
export async function patchText(
  repo: string,
  base: string,
  tree: string,
  env: NodeJS.ProcessEnv,
  maxChars: number
): Promise<string> {
  const r = await git(repo, ['diff', '-M', '--no-color', '--stat=120', '-p', base, tree], env)
  if (!r.ok) return ''
  return r.out.length > maxChars ? r.out.slice(0, maxChars) + '\n…(diff truncated)\n' : r.out
}
