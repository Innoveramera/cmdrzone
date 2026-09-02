// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The organism's senses. One subscription to the Claude Code hook feed, folded into (a) a
// stream of reflexes the canvas twitches to and (b) a short rolling window of "what are the
// agents doing" the Voice reads. Lives outside React so the frame loop can poll it without
// re-rendering, and so the feed is subscribed exactly once no matter who listens.

import type { AgentHookEvent } from '@shared/types'

/** What a tool call *is*, from the organism's point of view. */
export type ActKind = 'read' | 'write' | 'run' | 'spawn' | 'reach'
/** A twitch: a tool kind, or a lifecycle beat. */
export type Reflex = ActKind | 'prompt' | 'stop' | 'wake'

export interface Act {
  kind: ActKind
  at: number
  terminalId: string
}

export function classifyTool(name: string | undefined): ActKind {
  if (!name) return 'read'
  if (name.startsWith('mcp__')) return 'reach'
  switch (name) {
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'write'
    case 'Bash':
    case 'BashOutput':
    case 'KillShell':
    case 'PowerShell':
      return 'run'
    case 'Agent':
    case 'Task':
      return 'spawn'
    default:
      return 'read'
  }
}

type ReflexListener = (reflex: Reflex, terminalId: string) => void

const WINDOW_MS = 45_000
const acts: Act[] = []
const reflexListeners = new Set<ReflexListener>()
const changeListeners = new Set<() => void>()
let wired = false

function prune(now: number): void {
  while (acts.length && acts[0]!.at < now - WINDOW_MS) acts.shift()
}

function onHook(ev: AgentHookEvent): void {
  let reflex: Reflex | null = null
  switch (ev.event) {
    case 'PreToolUse': {
      const kind = classifyTool(ev.toolName)
      acts.push({ kind, at: Date.now(), terminalId: ev.terminalId })
      prune(Date.now())
      reflex = kind
      break
    }
    case 'UserPromptSubmit':
      reflex = 'prompt'
      break
    case 'Stop':
      reflex = 'stop'
      break
    case 'SessionStart':
      if (ev.source !== 'compact') reflex = 'wake'
      break
  }
  if (!reflex) return
  for (const l of reflexListeners) l(reflex, ev.terminalId)
  for (const l of changeListeners) l()
}

function ensureWired(): void {
  if (wired) return
  wired = true
  window.api.agents.onHookEvent(onHook)
}

export const senses = {
  /** Fires once per reflex (tool call / prompt / stop / wake). */
  onReflex(cb: ReflexListener): () => void {
    ensureWired()
    reflexListeners.add(cb)
    return () => reflexListeners.delete(cb)
  },
  /** Fires whenever the activity window changed — coarse "something happened" signal. */
  subscribe(cb: () => void): () => void {
    ensureWired()
    changeListeners.add(cb)
    return () => changeListeners.delete(cb)
  },
  /** Tool calls in the last 45s. */
  recent(): readonly Act[] {
    prune(Date.now())
    return acts
  },
  /** The kind that dominates recent activity, or null when there isn't enough to call. */
  dominant(): { kind: ActKind; count: number; total: number } | null {
    prune(Date.now())
    if (acts.length < 2) return null
    const counts = new Map<ActKind, number>()
    for (const a of acts) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1)
    let best: ActKind | null = null
    let bestN = 0
    for (const [k, n] of counts) {
      if (n > bestN) {
        best = k
        bestN = n
      }
    }
    return best ? { kind: best, count: bestN, total: acts.length } : null
  }
}

// ── Birth ──────────────────────────────────────────────────────────────────────────────────

const BORN_KEY = 'organismBorn'
let bornPromise: Promise<Date> | null = null

/** The day the organism first woke up on this machine — persisted once, never rewritten. */
export function born(): Promise<Date> {
  if (!bornPromise) {
    bornPromise = window.api.settings.get(BORN_KEY).then((v) => {
      const parsed = v ? new Date(v) : null
      if (parsed && !Number.isNaN(parsed.getTime())) return parsed
      const now = new Date()
      void window.api.settings.set(BORN_KEY, now.toISOString())
      return now
    })
  }
  return bornPromise
}

/** Whole calendar days between `from` and now (local time). */
export function ageInDays(from: Date, now = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}
