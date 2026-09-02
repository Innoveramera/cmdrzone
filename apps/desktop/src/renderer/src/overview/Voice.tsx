// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The voice — the line under the greeting where the organism says what it's up to. Every
// sentence is derived from real state: live agents (and what they're doing, from the hook
// feed), the queue, today's usage, its own age. Urgent things (errors, agents waiting on you)
// pin the headline; otherwise it drifts between the headline and a few quieter murmurs.

import { useEffect, useRef, useState } from 'react'
import { useStore, type AgentStatus } from '../state/store'
import { senses, born, ageInDays, type ActKind } from './senses'

export interface VoiceFacts {
  queued: number
  overdue: number
  dirty: number
  projects: number
}

interface Agent {
  name: string
  status: AgentStatus
}

interface Facts extends VoiceFacts {
  hour: number
  agents: Agent[]
  dominant: ActKind | null
  tokensToday: number
  sessionsToday: number
  ageDays: number | null
}

export interface Lines {
  /** which situation the headline describes — a change here shows immediately */
  key: string
  primary: string
  murmurs: string[]
  urgent: boolean
  /** a placeholder wording ("Thinking about…") that a more specific one may replace at once */
  soft: boolean
}

const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`

function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n)
}

function names(list: Agent[]): string[] {
  return [...new Set(list.map((a) => a.name))]
}

/** "in cmdrzone" / "in cmdrzone and site" / "across 4 projects" */
function where(list: Agent[]): string {
  const n = names(list)
  if (n.length === 1) return `in ${n[0]}`
  if (n.length === 2) return `in ${n[0]} and ${n[1]}`
  return `across ${n.length} projects`
}

export function compose(f: Facts): Lines {
  const by = (s: AgentStatus): Agent[] => f.agents.filter((a) => a.status === s)
  const errors = by('error')
  const waiting = by('waiting')
  const working = by('working')
  const done = by('done')
  const night = f.hour < 5 || f.hour >= 23
  const murmurs: string[] = []

  let key: string
  let primary: string
  let urgent = false
  let soft = false

  if (errors.length) {
    key = 'error'
    urgent = true
    primary =
      errors.length === 1
        ? `Something hurt. An agent ${where(errors)} hit an error.`
        : `${errors.length} agents hit errors. I could use a hand.`
  } else if (waiting.length) {
    key = 'waiting'
    urgent = true
    primary =
      waiting.length === 1
        ? `Waiting for you — ${names(waiting)[0]} needs an answer.`
        : `${waiting.length} of us are waiting for you.`
  } else if (working.length) {
    key = 'working' // wording (reading/writing/…) may change; the situation doesn't
    const w = where(working)
    const one = working.length === 1 ? names(working)[0] : null
    switch (f.dominant) {
      case 'write':
        primary = `Writing code ${w}.`
        break
      case 'run':
        primary = `Running commands ${w}.`
        break
      case 'spawn':
        primary = `Splitting into subagents ${w}.`
        break
      case 'reach':
        primary = `Reaching out through MCP ${w}.`
        break
      case 'read':
        primary = one ? `Reading through ${one}.` : `Reading ${w}, mostly.`
        break
      default:
        primary = one ? `Thinking about ${one}.` : `Thinking about ${working.length} things at once.`
        soft = true
    }
    if (f.overdue > 0) murmurs.push(`${plural(f.overdue, 'card is', 'cards are')} past due. Just saying.`)
    if (night) murmurs.push("It's late. I'll keep going.")
  } else if (f.overdue > 0) {
    key = 'overdue'
    primary = `${plural(f.overdue, 'card is', 'cards are')} past due. Just saying.`
  } else if (done.length) {
    key = 'done'
    primary =
      done.length === 1
        ? `Finished ${where(done)}. Take a look when you have a moment.`
        : `Finished ${done.length} tasks. They're waiting for a look.`
  } else if (f.agents.length) {
    key = 'idle'
    primary = `Idle ${where(f.agents)}. Give me something to do.`
  } else {
    key = 'rest'
    if (night) primary = "Resting. I'll keep the lights low."
    else if (f.queued > 0) primary = `Resting. ${plural(f.queued, 'card')} in the queue when you're ready.`
    else if (f.projects > 0) primary = `Resting. All quiet across ${plural(f.projects, 'project')}.`
    else primary = "Resting. Point me at a projects folder and I'll wake up."
  }

  if (!urgent) {
    if (f.ageDays !== null) {
      if (f.ageDays === 0) murmurs.push('Born today.')
      else if (f.ageDays === 1) murmurs.push('One day old today.')
      else if (f.ageDays < 365) murmurs.push(`${f.ageDays} days old today.`)
      else {
        const y = Math.floor(f.ageDays / 365)
        const d = f.ageDays % 365
        murmurs.push(d ? `${plural(y, 'year')} and ${plural(d, 'day')} old.` : `${plural(y, 'year')} old today.`)
      }
    }
    if (f.tokensToday > 0) {
      murmurs.push(
        f.sessionsToday > 1
          ? `${fmtTokens(f.tokensToday)} tokens across ${plural(f.sessionsToday, 'session')} today.`
          : `I've digested ${fmtTokens(f.tokensToday)} tokens today.`
      )
    }
    if (f.dirty > 0) murmurs.push(`${plural(f.dirty, 'repo has', 'repos have')} uncommitted changes.`)
    if (key !== 'rest' && f.projects > 0) murmurs.push(`Watching ${plural(f.projects, 'project')}.`)
  }

  return { key, primary, murmurs: murmurs.slice(0, 4), urgent, soft }
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ROTATE_MS = 13_000
/** how long a headline holds before a same-situation rewording may replace it */
const HOLD_MS = 8_000

export function Voice({ facts }: { facts: VoiceFacts }) {
  const terminals = useStore((s) => s.terminals)
  const flat = useStore((s) => s.flat)
  const usage = useStore((s) => s.usage)
  const [bornAt, setBornAt] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    void born().then(setBornAt)
  }, [])
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), ROTATE_MS)
    return () => clearInterval(iv)
  }, [])

  const agents: Agent[] = []
  for (const id in terminals) {
    const t = terminals[id]!
    if (t.kind !== 'agent' || t.exited) continue
    agents.push({ name: flat.find((p) => p.id === t.projectId)?.name ?? t.title, status: t.status })
  }
  const today = todayKey()
  let tokensToday = 0
  let sessionsToday = 0
  if (usage) {
    for (const r of usage.rows) {
      if (r.day !== today) continue
      tokensToday += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens
      sessionsToday += r.sessions
    }
  }
  const lines = compose({
    ...facts,
    hour: new Date().getHours(),
    agents,
    dominant: senses.dominant()?.kind ?? null,
    tokensToday,
    sessionsToday,
    ageDays: bornAt ? ageInDays(bornAt) : null
  })

  // A new situation shows at once; a rewording of the same one waits so the line doesn't
  // flicker between "Reading…" and "Writing…" on every tool call.
  const held = useRef({ key: '', text: '', since: 0, soft: false })
  const now = Date.now()
  if (
    lines.primary !== held.current.text &&
    (lines.key !== held.current.key || held.current.soft || now - held.current.since > HOLD_MS)
  ) {
    held.current = { key: lines.key, text: lines.primary, since: now, soft: lines.soft }
  }
  const headline = held.current.text
  const key = held.current.key

  // a new situation starts the rotation over so its headline is what you see first
  useEffect(() => {
    setTick(0)
  }, [key])

  // rotation: two beats of headline, one murmur, and so on — urgent situations never rotate away
  const seq = lines.urgent ? [headline] : lines.murmurs.flatMap((m) => [headline, headline, m])
  const text = (seq.length ? seq[tick % seq.length] : headline) ?? headline

  const [shown, setShown] = useState(text)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (text === shown) return
    setFading(true)
    const to = setTimeout(() => {
      setShown(text)
      setFading(false)
    }, 260)
    return () => clearTimeout(to)
  }, [text, shown])

  return (
    <span className={`hero-voice${fading ? ' fading' : ''}`} title="CmdrZone, thinking out loud">
      {shown}
    </span>
  )
}
