// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Types for the Changes tab: checkpoint-based diffs (what did the agent change?) and the
// commit → push → pull-request flow. Pure data — no electron / node imports.

export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'T'

/** One changed file between a base (HEAD or a checkpoint) and a working-tree snapshot. */
export interface ChangedFile {
  path: string
  /** previous path for renames */
  oldPath?: string
  status: ChangeStatus
  added: number
  deleted: number
  binary: boolean
}

export interface ChangeSet {
  /** the base the files are compared against (a ref/sha; 'HEAD' for uncommitted work) */
  base: string
  /** sha of the snapshot tree taken of the working tree (untracked files included) */
  tree: string
  files: ChangedFile[]
}

export interface FileDiff {
  original: string
  modified: string
  /** true when either side is binary / unreadable — the UI shows a notice instead */
  binary: boolean
}

/**
 * A snapshot of the working tree, stored as a hidden ref (`refs/cz/cp/<terminalId>/<seq>`)
 * so it never touches the user's branch. seq 0 = the moment the agent session started; each
 * later one is taken when Claude Code reports a finished turn (Stop hook).
 */
export interface Checkpoint {
  ref: string
  sha: string
  terminalId: string
  seq: number
  /** unix ms */
  at: number
  /** 'start' | 'turn' */
  label: string
}

export interface CheckpointRevertResult {
  ok: boolean
  error?: string
}

export interface GitInfo {
  isRepo: boolean
  branch?: string
  /** e.g. origin/main — undefined when the branch has no upstream yet */
  upstream?: string
  ahead: number
  behind: number
  /** origin's URL, if any */
  remoteUrl?: string
  /** whether origin points at github.com (enables the PR step) */
  isGithub: boolean
  /** the remote's default branch name (main/master/…) */
  defaultBranch?: string
  /** GitHub CLI present and authenticated — required for "Create PR" */
  ghReady: boolean
  ghHint?: string
}

export interface GitOpResult {
  ok: boolean
  /** commit sha / PR url depending on the op */
  value?: string
  error?: string
}

export interface PrInfo {
  number: number
  url: string
  title: string
  /** OPEN | MERGED | CLOSED */
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  baseRefName: string
  headRefName: string
}

/** Commit message + PR text drafted by a headless `claude -p` run over the diff. */
export interface GeneratedMessages {
  ok: boolean
  commitSubject?: string
  commitBody?: string
  prTitle?: string
  prBody?: string
  error?: string
}
