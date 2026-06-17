// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useMemo, useState } from 'react'
import type { ProjectType } from '@shared/types'
import { useStore } from '../state/store'
import { ProjectCard } from './ProjectCard'
import { statusRank, summarizeProject } from '../lib/format'

const TYPES: { key: ProjectType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'next', label: 'Next.js' },
  { key: 'flutter', label: 'Flutter' },
  { key: 'mcp', label: 'MCP' },
  { key: 'node-ts', label: 'Node/TS' }
]

export function ProjectGrid() {
  const projects = useStore((s) => s.projects)
  const terminals = useStore((s) => s.terminals)
  const [q, setQ] = useState('')
  const [type, setType] = useState<ProjectType | 'all'>('all')
  const [pinnedOnly, setPinnedOnly] = useState(false)

  const visible = useMemo(() => {
    let list = projects.filter((p) => !p.isHidden)
    const ql = q.toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(ql) ||
          p.children?.some((c) => c.name.toLowerCase().includes(ql))
      )
    }
    if (type !== 'all') {
      list = list.filter((p) => p.type === type || p.children?.some((c) => c.type === type))
    }
    if (pinnedOnly) list = list.filter((p) => p.isPinned)
    return [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      const ra = statusRank(summarizeProject(a.id, terminals).status)
      const rb = statusRank(summarizeProject(b.id, terminals).status)
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
  }, [projects, terminals, q, type, pinnedOnly])

  const pinned = visible.filter((p) => p.isPinned)
  const rest = visible.filter((p) => !p.isPinned)

  return (
    <div className="overview">
      <div className="filterbar">
        <input
          className="search"
          placeholder="Filter projects…  (⌘K to switch)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={`chip ${type === t.key ? 'on' : ''}`}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
          <button className={`chip ${pinnedOnly ? 'on' : ''}`} onClick={() => setPinnedOnly((v) => !v)}>
            ★ Pinned
          </button>
        </div>
        <span className="count muted">
          {visible.length}/{projects.length}
        </span>
      </div>

      {pinned.length > 0 && (
        <>
          <div className="section">Pinned</div>
          <div className="grid">
            {pinned.map((p) => (
              <ProjectCard key={p.id} node={p} />
            ))}
          </div>
          <div className="section">All projects</div>
        </>
      )}
      <div className="grid">
        {rest.map((p) => (
          <ProjectCard key={p.id} node={p} />
        ))}
      </div>
    </div>
  )
}
