// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Token/cost aggregates read from Claude Code's JSONL transcripts (~/.claude/projects).

/** One aggregated slice of Claude Code usage: a (project, day, model) bucket. */
export interface UsageRow {
  /** absolute directory the messages ran in (transcript `cwd`); '' when unknown */
  projectPath: string
  /** local calendar day, YYYY-MM-DD (sorts lexicographically) */
  day: string
  /** raw model id, e.g. "claude-opus-4-8" */
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** estimated cost in USD from list pricing (incl. cache read/write rates) */
  costUsd: number
  /** deduplicated assistant messages (one per API response) */
  messages: number
  /** distinct Claude Code sessions that contributed to this bucket */
  sessions: number
}

export interface UsageSnapshot {
  rows: UsageRow[]
  /** number of transcript files aggregated */
  fileCount: number
  /** epoch ms when the scan finished */
  scannedAt: number
}
