// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import type { AgentStatus } from '../state/store'

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]|\x1b\][^\\]*\\/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

export function lastNonEmptyLine(buffer: string): string {
  const lines = stripAnsi(buffer).split('\n').map((l) => l.trim()).filter(Boolean)
  return lines[lines.length - 1] ?? ''
}

/**
 * Classify an agent terminal's recent output once it has gone quiet.
 * Heuristic, but good enough to surface "needs me" across all projects.
 */
export function classifyIdle(buffer: string): Extract<AgentStatus, 'waiting' | 'error' | 'idle'> {
  const last = lastNonEmptyLine(buffer)
  if (/\b(error|exception|failed|fatal|traceback)\b/i.test(last)) return 'error'
  if (/(\(y\/n\)|\[y\/n\]|❯|›|＞|\?\s*$|:\s*$|password|continue\?|proceed\?|overwrite\?)/i.test(last)) {
    return 'waiting'
  }
  return 'idle'
}
