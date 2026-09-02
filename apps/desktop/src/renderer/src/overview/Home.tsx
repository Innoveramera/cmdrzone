// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Home "mission control" — the no-project-selected landing view's top half.
// A greeting hero with live telemetry (clock, agents, queued cards, dirty repos, today's
// spend), then two aggregate panels: "Up next" (To Do / In Progress cards across ALL
// project boards) and "Agents" (live sessions). All data is real store state — the panels
// are shortcuts into the project that owns each row.

import { useEffect, useMemo, useState } from 'react'
import type { ProjectNode, UpNextCard } from '@shared/types'
import { useStore } from '../state/store'
import { STATUS_META, statusRank, relTime, dueInfo } from '../lib/format'
import { OrganismCanvas } from './OrganismCanvas'
import { Voice } from './Voice'

function greetingFor(hour: number): string {
  if (hour < 5 || hour >= 23) return 'Working late'
  if (hour < 11) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const isDoingColumn = (title: string): boolean => /progress|doing|now/i.test(title)

const fmtUsd = (v: number): string =>
  v >= 100 ? '$' + Math.round(v) : v >= 10 ? '$' + v.toFixed(1) : '$' + v.toFixed(2)

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Live HH:MM:SS + date. Ticks only while the home layer is actually visible. */
function Clock() {
  const visible = useStore((s) => s.selectedProjectId === null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!visible) return
    setNow(new Date())
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [visible])
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    <div className="hero-clock-wrap">
      <div className="hero-clock">
        {p(now.getHours())}:{p(now.getMinutes())}
        <span className="hero-sec">:{p(now.getSeconds())}</span>
      </div>
      <div className="hero-date">
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}

/** Greeting with an inline-editable name (settings key `userName`), like the usage plan field. */
function Greeting() {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    void window.api.settings.get('userName').then(setName)
  }, [])
  const save = (): void => {
    const v = draft.trim()
    setName(v)
    setEditing(false)
    void window.api.settings.set('userName', v)
  }
  const greeting = greetingFor(new Date().getHours())
  return (
    <div className="hero-greeting">
      {greeting}
      {editing ? (
        <>
          {', '}
          <input
            className="hero-name-input"
            autoFocus
            placeholder="your name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              else if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={save}
          />
        </>
      ) : name ? (
        <>
          {', '}
          <button
            className="hero-name"
            title="Click to change your name"
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
          >
            {name}
          </button>
          .
        </>
      ) : (
        <>
          .
          <button
            className="hero-name-add"
            title="Tell CmdrZone your name"
            onClick={() => {
              setDraft('')
              setEditing(true)
            }}
          >
            + name
          </button>
        </>
      )}
    </div>
  )
}

interface Telemetry {
  projects: number
  agents: number
  waiting: number
  queued: number
  overdue: number
  dirty: number
  todayUsd: number | null
}

function HeroStats({ t }: { t: Telemetry }) {
  return (
    <div className="hero-stats">
      <span className={`hstat ${t.agents > 0 ? 'live' : 'zero'}`}>
        <span className="v">{t.agents}</span>
        <span className="k">{t.agents === 1 ? 'agent live' : 'agents live'}</span>
      </span>
      {t.waiting > 0 && (
        <span className="hstat warn">
          <span className="v">{t.waiting}</span>
          <span className="k">waiting on you</span>
        </span>
      )}
      {t.overdue > 0 && (
        <span className="hstat alert">
          <span className="v">{t.overdue}</span>
          <span className="k">overdue</span>
        </span>
      )}
      <span className={`hstat ${t.queued > 0 ? '' : 'zero'}`}>
        <span className="v">{t.queued}</span>
        <span className="k">up next</span>
      </span>
      <span className={`hstat ${t.dirty > 0 ? '' : 'zero'}`}>
        <span className="v">{t.dirty}</span>
        <span className="k">{t.dirty === 1 ? 'dirty repo' : 'dirty repos'}</span>
      </span>
      <span className="hstat zero">
        <span className="v">{t.projects}</span>
        <span className="k">projects</span>
      </span>
      {t.todayUsd !== null && (
        <span className="hstat zero">
          <span className="v">{fmtUsd(t.todayUsd)}</span>
          <span className="k">today</span>
        </span>
      )}
    </div>
  )
}

function UpNextPanel({ rows, byPath }: { rows: UpNextCard[]; byPath: Map<string, ProjectNode> }) {
  const open = (c: UpNextCard): void => {
    const s = useStore.getState()
    s.selectProject(c.projectPath)
    s.setDetailMode('board')
  }
  return (
    <div className="hpanel">
      <div className="hpanel-head">
        <span className="hpanel-title">Up next</span>
        {rows.length > 0 && <span className="hpanel-count">{rows.length}</span>}
        <span className="spacer" />
        <span className="hpanel-hint">across all boards</span>
      </div>
      {rows.length === 0 ? (
        <div className="hpanel-empty">
          Nothing queued. Cards in a project board&apos;s <b>To&nbsp;Do</b> and{' '}
          <b>In&nbsp;Progress</b> columns land here.
        </div>
      ) : (
        <div className="hpanel-body">
          {rows.map((c) => {
            const p = byPath.get(c.projectPath)!
            const doing = isDoingColumn(c.columnTitle)
            return (
              <button
                key={c.id}
                className="next-row"
                data-type={c.type}
                title={`${c.title} — ${p.name} · ${c.columnTitle} · updated ${relTime(c.updatedAt) || 'just now'}`}
                onClick={() => open(c)}
              >
                <span className="next-main">
                  <span className="next-title">
                    {(c.priority ?? 0) > 0 && (
                      <span className="prio-star" title="Priority">
                        ★{' '}
                      </span>
                    )}
                    {c.title}
                  </span>
                  <span className="next-proj">
                    <span className="chip-dot" style={{ background: p.color }} />
                    {p.name}
                  </span>
                </span>
                {(() => {
                  const due = dueInfo(c.dueAt)
                  return due && <span className={`due-chip ${due.tone}`}>{due.label}</span>
                })()}
                <span className={`next-state ${doing ? 'now' : ''}`}>{c.columnTitle}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AgentsPanel() {
  const terminals = useStore((s) => s.terminals)
  const rows = Object.values(terminals)
    .filter((t) => t.kind === 'agent' && !t.exited)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
  return (
    <div className="hpanel">
      <div className="hpanel-head">
        <span className="hpanel-title">Agents</span>
        {rows.length > 0 && <span className="hpanel-count">{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <div className="hpanel-empty">
          No agents running. Open a project and launch one — sessions report back here.
        </div>
      ) : (
        <div className="hpanel-body">
          {rows.map((t) => {
            const project = useStore.getState().findProject(t.projectId)
            const st = STATUS_META[t.status]
            return (
              <button
                key={t.id}
                className="agent-row"
                onClick={() => {
                  useStore.getState().focusTerminal(t.projectId, t.id)
                  useStore.getState().selectProject(t.projectId)
                }}
              >
                <span className={`sdot ${st.cls}`} />
                <span className="next-main">
                  <span className="next-title">{project?.name ?? t.title}</span>
                  <span className="agent-line">{t.lastLine || st.label.toLowerCase()}</span>
                </span>
                <span className={`pill sm ${st.cls}`}>{st.glyph}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Home() {
  const selectedProjectId = useStore((s) => s.selectedProjectId)
  const flat = useStore((s) => s.flat)
  const terminals = useStore((s) => s.terminals)
  const gitByPath = useStore((s) => s.gitByPath)
  const upNext = useStore((s) => s.upNext)
  const usage = useStore((s) => s.usage)

  // Reload the aggregated cards whenever the user lands back on home or refocuses the app
  // (a board may have changed in a project view, or via the CLI/MCP outside the app).
  useEffect(() => {
    if (selectedProjectId === null) void useStore.getState().loadUpNext()
  }, [selectedProjectId])
  useEffect(() => {
    const onFocus = (): void => {
      if (!useStore.getState().selectedProjectId) void useStore.getState().loadUpNext()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const byPath = useMemo(() => new Map(flat.map((p) => [p.path, p])), [flat])
  // Only show cards whose project is still in the scan — everything must stay clickable.
  const queued = useMemo(() => (upNext ?? []).filter((c) => byPath.has(c.projectPath)), [upNext, byPath])

  const telemetry = useMemo<Telemetry>(() => {
    let agents = 0
    let waiting = 0
    for (const id in terminals) {
      const t = terminals[id]!
      if (t.kind !== 'agent' || t.exited) continue
      agents++
      if (t.status === 'waiting') waiting++
    }
    let dirty = 0
    for (const path in gitByPath) {
      const g = gitByPath[path]!
      if (g.isRepo && g.dirty > 0) dirty++
    }
    const today = todayKey()
    const todayUsd = usage
      ? usage.rows.reduce((s, r) => (r.day === today ? s + r.costUsd : s), 0)
      : null
    let overdue = 0
    for (const c of queued) {
      const d = dueInfo(c.dueAt)
      if (d && d.days < 0) overdue++
    }
    return {
      projects: flat.filter((p) => p.kind === 'project' && !p.isHidden).length,
      agents,
      waiting,
      queued: queued.length,
      overdue,
      dirty,
      todayUsd
    }
  }, [flat, terminals, gitByPath, queued, usage])

  return (
    <>
      <div className="home-hero">
        <OrganismCanvas />
        <div className="hero-top">
          <div>
            <div className="hero-eyebrow">CmdrZone · command center</div>
            <Greeting />
            <div className="hero-sub">
              <Voice facts={telemetry} />
            </div>
          </div>
          <Clock />
        </div>
        <HeroStats t={telemetry} />
      </div>
      <div className="home-panels">
        <UpNextPanel rows={queued} byPath={byPath} />
        <AgentsPanel />
      </div>
    </>
  )
}
