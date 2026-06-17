// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import type { ProjectType } from '@shared/types'
import type { AgentStatus, TerminalTab } from '../state/store'

export function typeLabel(t: ProjectType): string {
  switch (t) {
    case 'next':
      return 'Next.js'
    case 'flutter':
      return 'Flutter'
    case 'mcp':
      return 'MCP'
    case 'node-ts':
      return 'Node/TS'
    default:
      return '—'
  }
}

export const STATUS_META: Record<AgentStatus, { label: string; glyph: string; cls: string }> = {
  idle: { label: 'idle', glyph: '○', cls: 'st-idle' },
  working: { label: 'WORKING', glyph: '▶', cls: 'st-working' },
  waiting: { label: 'WAITING', glyph: '⏸', cls: 'st-waiting' },
  done: { label: 'DONE', glyph: '✅', cls: 'st-done' },
  error: { label: 'ERROR', glyph: '⛔', cls: 'st-error' }
}

export function statusRank(s: AgentStatus): number {
  return s === 'waiting' ? 0 : s === 'error' ? 1 : s === 'working' ? 2 : s === 'done' ? 3 : 4
}

export interface AgentSummary {
  status: AgentStatus
  lastLine: string
  agentCount: number
  termCount: number
}

/** Aggregate the agent terminals of a project into a single headline. */
export function summarizeProject(projectId: string, terminals: Record<string, TerminalTab>): AgentSummary {
  let best: TerminalTab | null = null
  let agentCount = 0
  let termCount = 0
  for (const id in terminals) {
    const t = terminals[id]!
    if (t.projectId !== projectId) continue
    termCount++
    if (t.kind !== 'agent') continue
    agentCount++
    if (!best || statusRank(t.status) < statusRank(best.status)) best = t
  }
  return {
    status: best?.status ?? 'idle',
    lastLine: best?.lastLine ?? '',
    agentCount,
    termCount
  }
}

export function relTime(ts?: number): string {
  if (!ts) return ''
  const d = Date.now() - ts
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
