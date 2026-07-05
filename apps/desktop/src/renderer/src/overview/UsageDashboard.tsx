// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Dashboard widget: Claude Code token/cost overview (per day, per project, per model).
// Main aggregates the JSONL transcripts into (project, day, model) rows; this component
// only groups and renders them. Charts are hand-rolled CSS bars styled via --viz-* tokens.

import { useEffect, useMemo, useState } from 'react'
import type { UsageRow } from '@shared/usage'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'

type Range = '7d' | '30d' | 'all'
/** Which lens the whole widget renders through: money (est. API value) or token volume. */
type Metric = 'cost' | 'tokens'

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All' }
]

const METRICS: { key: Metric; label: string; title: string }[] = [
  { key: 'cost', label: '$', title: 'Estimated API value' },
  { key: 'tokens', label: 'tok', title: 'Tokens (input + output + cache)' }
]

// Fixed color per model family (color follows the entity, never its rank).
const FAMILY_COLOR: Record<string, string> = {
  opus: 'var(--viz-1)',
  sonnet: 'var(--viz-2)',
  haiku: 'var(--viz-3)',
  fable: 'var(--viz-4)',
  mythos: 'var(--viz-4)',
  other: 'var(--viz-other)'
}

function familyOf(model: string): string {
  for (const f of ['opus', 'sonnet', 'haiku', 'fable', 'mythos']) if (model.includes(f)) return f
  return 'other'
}

/** "claude-opus-4-8" → "Opus 4.8", "claude-3-5-sonnet-20241022" → "Sonnet 3.5" */
function prettyModel(id: string): string {
  const parts = id
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .split('-')
  const fam = parts.find((p) => /^[a-z]/i.test(p))
  if (!fam) return id
  const nums = parts.filter((p) => /^\d+$/.test(p))
  return fam[0]!.toUpperCase() + fam.slice(1) + (nums.length ? ' ' + nums.join('.') : '')
}

function fmtUsd(v: number): string {
  if (v >= 100) return '$' + Math.round(v).toLocaleString('en-US')
  if (v >= 10) return '$' + v.toFixed(1)
  return '$' + v.toFixed(2)
}

function fmtTokens(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(v)
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** Monday of the week that contains `d` (weekly buckets for the "All" range). */
function weekStart(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7))
}

const tokensOf = (r: UsageRow): number =>
  r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens

interface Bucket {
  key: string
  label: string
  cost: number
  tokens: number
}

function buildBuckets(rows: UsageRow[], range: Range): Bucket[] {
  const byKey = new Map<string, Bucket>()
  const push = (key: string, label: string, r?: UsageRow): Bucket => {
    let b = byKey.get(key)
    if (!b) byKey.set(key, (b = { key, label, cost: 0, tokens: 0 }))
    if (r) {
      b.cost += r.costUsd
      b.tokens += tokensOf(r)
    }
    return b
  }

  const today = new Date()
  if (range === 'all') {
    if (rows.length === 0) return []
    let first = rows[0]!.day
    for (const r of rows) if (r.day < first) first = r.day
    // Seed every week from the first recorded one so quiet weeks show as gaps, not jumps.
    for (let w = weekStart(parseDay(first)); w <= today; w = addDays(w, 7)) {
      push(dayKey(w), `${w.getDate()}/${w.getMonth() + 1}`)
    }
    for (const r of rows) {
      const w = weekStart(parseDay(r.day))
      push(dayKey(w), `${w.getDate()}/${w.getMonth() + 1}`, r)
    }
  } else {
    const n = range === '7d' ? 7 : 30
    for (let i = n - 1; i >= 0; i--) {
      const d = addDays(today, -i)
      const label =
        range === '7d'
          ? d.toLocaleDateString(undefined, { weekday: 'short' })
          : `${d.getDate()}/${d.getMonth() + 1}`
      push(dayKey(d), label)
    }
    for (const r of rows) {
      const b = byKey.get(r.day)
      if (b) {
        b.cost += r.costUsd
        b.tokens += tokensOf(r)
      }
    }
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}

/** Map a transcript cwd onto a scanned project so all its subdirectories fold into one row. */
function resolveProject(path: string, flat: ProjectNode[]): { key: string; name: string; color?: string } {
  if (!path) return { key: '', name: 'unknown' }
  const exact = flat.find((p) => p.path === path)
  if (exact) return { key: exact.path, name: exact.name, color: exact.color }
  // cwd may be a subdirectory of a scanned project — take the longest matching parent.
  let best: ProjectNode | undefined
  for (const p of flat) {
    if (path.startsWith(p.path + '/') && (!best || p.path.length > best.path.length)) best = p
  }
  if (best) return { key: best.path, name: best.name, color: best.color }
  return { key: path, name: path.split('/').filter(Boolean).pop() ?? path }
}

interface ProjectSlice {
  key: string
  name: string
  color?: string
  cost: number
  tokens: number
  sessions: number
}

interface ModelSlice {
  key: string
  name: string
  color: string
  cost: number
  tokens: number
}

export function UsageDashboard() {
  const usage = useStore((s) => s.usage)
  const usageLoading = useStore((s) => s.usageLoading)
  const flat = useStore((s) => s.flat)
  const [range, setRange] = useState<Range>('30d')
  const [metric, setMetric] = useState<Metric>('cost')
  const [collapsed, setCollapsed] = useState(false)
  const [tip, setTip] = useState<number | null>(null)
  // Fixed subscription price (Pro/Max) the user actually pays, e.g. "€180" — free text.
  const [planCost, setPlanCost] = useState('')
  const [editingPlan, setEditingPlan] = useState(false)
  const [planDraft, setPlanDraft] = useState('')

  useEffect(() => {
    void window.api.settings.get('usageCollapsed').then((v) => setCollapsed(v === '1'))
    void window.api.settings.get('usagePlanCost').then((v) => setPlanCost(v))
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      void window.api.settings.set('usageCollapsed', c ? '0' : '1')
      return !c
    })
  }
  const startEditPlan = () => {
    setPlanDraft(planCost)
    setEditingPlan(true)
  }
  const savePlan = () => {
    const v = planDraft.trim()
    setPlanCost(v)
    setEditingPlan(false)
    void window.api.settings.set('usagePlanCost', v)
  }

  const rows = usage?.rows

  const tiles = useMemo(() => {
    if (!rows) return null
    const today = dayKey(new Date())
    const d7 = dayKey(addDays(new Date(), -6))
    const d30 = dayKey(addDays(new Date(), -29))
    const sum = (from: string) => {
      let cost = 0
      let tokens = 0
      for (const r of rows) {
        if (r.day >= from) {
          cost += r.costUsd
          tokens += tokensOf(r)
        }
      }
      return { cost, tokens }
    }
    return { today: sum(today), week: sum(d7), month: sum(d30) }
  }, [rows])

  // Everything below reads the selected metric through mv() so the $/tok toggle
  // re-ranks, re-scales and re-labels all three panels consistently.
  const mv = (x: { cost: number; tokens: number }): number =>
    metric === 'cost' ? x.cost : x.tokens
  const fmtVal = metric === 'cost' ? fmtUsd : fmtTokens

  const data = useMemo(() => {
    if (!rows) return null
    const cutoff = range === 'all' ? '' : dayKey(addDays(new Date(), -(range === '7d' ? 6 : 29)))
    const inRange = cutoff ? rows.filter((r) => r.day >= cutoff) : rows
    const val = (x: { cost: number; tokens: number }): number =>
      metric === 'cost' ? x.cost : x.tokens

    const buckets = buildBuckets(inRange, range)
    const maxBucket = Math.max(0, ...buckets.map(val))

    // Projects, ranked by cost — grouped by the RESOLVED project, so agents run in
    // subdirectories of the same repo fold into one row. Top 7 + a folded "other" row.
    const byProject = new Map<string, ProjectSlice>()
    for (const r of inRange) {
      const info = resolveProject(r.projectPath, flat)
      let p = byProject.get(info.key)
      if (!p) {
        byProject.set(
          info.key,
          (p = { key: info.key, name: info.name, color: info.color, cost: 0, tokens: 0, sessions: 0 })
        )
      }
      p.cost += r.costUsd
      p.tokens += tokensOf(r)
      p.sessions += r.sessions
    }
    const rankedProjects = [...byProject.values()].sort((a, b) => val(b) - val(a))
    const topProjects = rankedProjects.slice(0, 7)
    const restProjects = rankedProjects.slice(7)
    if (restProjects.length > 0) {
      topProjects.push({
        key: ' other',
        name: `${restProjects.length} more…`,
        cost: restProjects.reduce((s, p) => s + p.cost, 0),
        tokens: restProjects.reduce((s, p) => s + p.tokens, 0),
        sessions: restProjects.reduce((s, p) => s + p.sessions, 0)
      })
    }

    // Models, ranked by cost. Top 5 + "other"; color is fixed per family.
    const byModel = new Map<string, ModelSlice>()
    for (const r of inRange) {
      let m = byModel.get(r.model)
      if (!m) {
        byModel.set(
          r.model,
          (m = {
            key: r.model,
            name: prettyModel(r.model),
            color: FAMILY_COLOR[familyOf(r.model)] ?? FAMILY_COLOR.other!,
            cost: 0,
            tokens: 0
          })
        )
      }
      m.cost += r.costUsd
      m.tokens += tokensOf(r)
    }
    const rankedModels = [...byModel.values()].sort((a, b) => val(b) - val(a))
    const models = rankedModels.slice(0, 5)
    const restModels = rankedModels.slice(5)
    if (restModels.length > 0) {
      models.push({
        key: ' other',
        name: 'Other',
        color: FAMILY_COLOR.other!,
        cost: restModels.reduce((s, m) => s + m.cost, 0),
        tokens: restModels.reduce((s, m) => s + m.tokens, 0)
      })
    }
    const modelTotal = models.reduce((s, m) => s + val(m), 0)

    return { buckets, maxBucket, projects: topProjects, models, modelTotal }
  }, [rows, range, metric, flat])

  // "€180" / "180" / "1 800 kr" → a number. The ×-ratio is deliberately rough (no currency
  // conversion) — the API value itself is a list-price estimate.
  const planNumber = parseFloat(planCost.replace(/[^\d.,]/g, '').replace(',', '.'))
  const planRatio =
    tiles && Number.isFinite(planNumber) && planNumber > 0 ? tiles.month.cost / planNumber : null

  // Nothing recorded at all → the user doesn't run Claude Code; stay out of the way.
  if (rows && rows.length === 0) return null

  const labelStep =
    data == null || data.buckets.length <= 8 ? 1 : Math.ceil(data.buckets.length / 6)

  return (
    <div className="usage">
      <div className="usage-head">
        <span
          className="usage-title"
          title={usage ? `${usage.fileCount} transcript files · scanned ${new Date(usage.scannedAt).toLocaleTimeString()}` : undefined}
        >
          Claude usage
        </span>
        {tiles && (
          <div className="usage-tiles">
            <span className="usage-tile">
              <span className="v">{fmtVal(mv(tiles.today))}</span>
              <span className="k">today</span>
            </span>
            <span className="usage-tile">
              <span className="v">{fmtVal(mv(tiles.week))}</span>
              <span className="k">7 days</span>
            </span>
            <span className="usage-tile">
              <span className="v">{fmtVal(mv(tiles.month))}</span>
              <span className="k">30 days</span>
            </span>
            {metric === 'cost' && (
              <>
                <span
                  className="usage-note"
                  title="What this usage would cost at API list prices. On a fixed-price subscription (Pro/Max) your actual cost is the plan price — set it to compare."
                >
                  ≈ API value
                </span>
                {editingPlan ? (
                  <input
                    className="usage-plan-input"
                    autoFocus
                    placeholder="€180"
                    value={planDraft}
                    onChange={(e) => setPlanDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') savePlan()
                      else if (e.key === 'Escape') setEditingPlan(false)
                    }}
                    onBlur={savePlan}
                  />
                ) : (
                  <button
                    className="usage-plan"
                    title="Your fixed subscription price per month — click to edit (clear to hide)"
                    onClick={startEditPlan}
                  >
                    {planCost
                      ? `plan ${planCost}/mo${planRatio != null ? ` · 30d ≈ ${planRatio >= 10 ? Math.round(planRatio) : planRatio.toFixed(1)}×` : ''}`
                      : 'vs plan…'}
                  </button>
                )}
              </>
            )}
            {metric === 'tokens' && <span className="usage-note">tokens incl. cache</span>}
          </div>
        )}
        {!usage && usageLoading && <span className="muted small">scanning transcripts…</span>}
        <span className="spacer" />
        {!collapsed && usage && (
          <>
            <div className="chips">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  title={m.title}
                  className={`chip ${metric === m.key ? 'on' : ''}`}
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="chips">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`chip ${range === r.key ? 'on' : ''}`}
                  onClick={() => {
                    setRange(r.key)
                    setTip(null) // bucket count changes — a kept index would point at the wrong bar
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          className="ghost sm"
          title="Rescan transcripts"
          disabled={usageLoading}
          onClick={() => void useStore.getState().loadUsage()}
        >
          ↻
        </button>
        <button className="ghost sm" title={collapsed ? 'Expand' : 'Collapse'} onClick={toggleCollapsed}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && data && (
        <div className="usage-body">
          <div className="usage-panel">
            <div className="usage-h">
              {(metric === 'cost' ? 'API value' : 'Tokens') + (range === 'all' ? ' per week' : ' per day')}
            </div>
            <div className="usage-chart" onMouseLeave={() => setTip(null)}>
              <div className="usage-bars">
                {data.buckets.map((b, i) => (
                  <div key={b.key} className="usage-bar" onMouseEnter={() => setTip(i)}>
                    <i
                      style={{
                        height:
                          data.maxBucket > 0 && mv(b) > 0
                            ? `${Math.max((mv(b) / data.maxBucket) * 100, 3)}%`
                            : '0%'
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="usage-xlab">
                {data.buckets.map((b, i) => (
                  <span key={b.key}>{i % labelStep === 0 ? b.label : ''}</span>
                ))}
              </div>
              {tip !== null && data.buckets[tip] && (
                <div
                  className="usage-tip"
                  style={{ left: `${((tip + 0.5) / data.buckets.length) * 100}%` }}
                >
                  <div className="muted">{data.buckets[tip].label}</div>
                  <div className="v">{fmtVal(mv(data.buckets[tip]))}</div>
                  <div className="muted">
                    {metric === 'cost'
                      ? `${fmtTokens(data.buckets[tip].tokens)} tokens`
                      : fmtUsd(data.buckets[tip].cost)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="usage-panel">
            <div className="usage-h">Top projects</div>
            <div className="usage-rows">
              {data.projects.map((p) => {
                const max = data.projects[0] ? mv(data.projects[0]) : 1
                return (
                  <div
                    key={p.key}
                    className="usage-row"
                    title={`${p.name} · ${fmtUsd(p.cost)} · ${fmtTokens(p.tokens)} tokens · ${p.sessions} sessions`}
                  >
                    <span className="chip-dot" style={{ background: p.color ?? 'var(--viz-other)' }} />
                    <span className="usage-row-name">{p.name}</span>
                    <span className="usage-row-bar">
                      <i style={{ width: `${max > 0 ? (mv(p) / max) * 100 : 0}%` }} />
                    </span>
                    <span className="usage-row-val">{fmtVal(mv(p))}</span>
                  </div>
                )
              })}
              {data.projects.length === 0 && <div className="muted small">No usage in this range.</div>}
            </div>
          </div>

          <div className="usage-panel">
            <div className="usage-h">Models</div>
            {data.models.length > 0 && (
              <div className="usage-stack">
                {data.models.map((m) => (
                  <i
                    key={m.key}
                    style={{
                      flexBasis: `${data.modelTotal > 0 ? (mv(m) / data.modelTotal) * 100 : 0}%`,
                      background: m.color
                    }}
                    title={`${m.name} · ${fmtVal(mv(m))}`}
                  />
                ))}
              </div>
            )}
            <div className="usage-rows">
              {data.models.map((m) => (
                <div
                  key={m.key}
                  className="usage-row"
                  title={`${m.name} · ${fmtUsd(m.cost)} · ${fmtTokens(m.tokens)} tokens`}
                >
                  <span className="chip-dot" style={{ background: m.color }} />
                  <span className="usage-row-name">{m.name}</span>
                  <span className="usage-row-val muted">
                    {data.modelTotal > 0 ? Math.round((mv(m) / data.modelTotal) * 100) : 0}%
                  </span>
                  <span className="usage-row-val">{fmtVal(mv(m))}</span>
                </div>
              ))}
              {data.models.length === 0 && <div className="muted small">No usage in this range.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
