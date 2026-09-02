// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { summarizeProject, statusRank, STATUS_META } from '../lib/format'

const COLLAPSE_KEY = 'cmdrzone.tree.collapsed'

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function Row({ node, child, flat }: { node: ProjectNode; child?: boolean; flat?: boolean }) {
  const selected = useStore((s) => s.selectedProjectId === node.id)
  const terminals = useStore((s) => s.terminals)
  const git = useStore((s) => s.gitByPath[node.path])
  const sum = summarizeProject(node.id, terminals)
  const st = STATUS_META[sum.status]
  const parent = flat ? node.parentPath?.split('/').pop() : undefined
  const dirty = git?.isRepo ? git.dirty : 0
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)

  const commit = () => {
    setRenaming(false)
    const next = name.trim()
    if (next && next !== node.name) void useStore.getState().renameProject(node.path, next)
    else setName(node.name)
  }

  // One indicator per row (agent status > open session > dirty); the rest lives here.
  const hint = [node.path]
  if (sum.agentCount > 0) hint.push(`agent ${st.label.toLowerCase()}`)
  if (sum.termCount > 0) hint.push(`${sum.termCount} open terminal${sum.termCount > 1 ? 's' : ''}`)
  if (dirty > 0) hint.push(`${dirty} modified file${dirty > 1 ? 's' : ''}`)
  if (!node.worktreeOf) hint.push('double-click name to rename')

  return (
    <div
      className={`trow ${child ? 'child' : ''} ${selected ? 'sel' : ''}`}
      onClick={() => !renaming && useStore.getState().selectProject(node.id)}
      title={hint.join('\n')}
    >
      <span className="tdot2" style={{ background: node.color }} />
      {renaming ? (
        <input
          className="trow-rename"
          autoFocus
          value={name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') {
              setName(node.name)
              setRenaming(false)
            }
          }}
        />
      ) : (
        <span
          className="tname"
          onDoubleClick={(e) => {
            if (node.worktreeOf) return // worktree names are branch-derived, not renamable
            e.stopPropagation()
            setName(node.name)
            setRenaming(true)
          }}
        >
          {node.worktreeOf ? <span className="twt">⎇ </span> : null}
          {node.name}
        </span>
      )}
      {!renaming && parent && <span className="tparent">{parent}</span>}
      {!renaming && (
        <span className="tind">
          {sum.agentCount > 0 ? (
            <span className={`sdot ${st.cls}`} />
          ) : sum.termCount > 0 ? (
            <span className="sdot session" />
          ) : dirty > 0 ? (
            <span className="tdirty">✎</span>
          ) : null}
        </span>
      )}
      {!renaming &&
        (node.worktreeOf ? (
          <span className="tstar" />
        ) : (
          <span
            className={`tstar ${node.isPinned ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              void useStore.getState().togglePin(node)
            }}
          >
            {node.isPinned ? '★' : '☆'}
          </span>
        ))}
    </div>
  )
}

/** A project row plus its git-worktree children (parallel-agent checkouts), indented below. */
function ProjectRow({ node, child, flat }: { node: ProjectNode; child?: boolean; flat?: boolean }) {
  return (
    <>
      <Row node={node} child={child} flat={flat} />
      {node.children?.map((w) => (
        <Row key={w.id} node={w} child />
      ))}
    </>
  )
}

function GroupRow({
  node,
  open,
  onToggle,
  hide
}: {
  node: ProjectNode
  open: boolean
  onToggle: () => void
  hide: Set<string>
}) {
  const kids = (node.children ?? []).filter((c) => !hide.has(c.id))
  if (kids.length === 0) return null
  return (
    <div className="tgroup">
      <div className="trow grouphdr" onClick={onToggle}>
        <span className="tchev">{open ? '▾' : '▸'}</span>
        <span className="tname">{node.name}</span>
        <span className="tcount">{kids.length}</span>
      </div>
      {open && (
        <div className="tchildren">
          {kids.map((c) => (
            <ProjectRow key={c.id} node={c} child />
          ))}
        </div>
      )}
    </div>
  )
}

function Section({
  label,
  count,
  open,
  onToggle,
  title
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  title?: string
}) {
  return (
    <div className="tree-section" onClick={onToggle} title={title}>
      <span className="tchev">{open ? '▾' : '▸'}</span>
      <span className="tsec-label">{label}</span>
      <span className="tcount">{count}</span>
    </div>
  )
}

function flattenAll(projects: ProjectNode[]): ProjectNode[] {
  const out: ProjectNode[] = []
  for (const n of projects) {
    if (n.kind === 'group') {
      if (n.children) out.push(...n.children)
    } else {
      out.push(n)
    }
  }
  return out
}

export function ProjectTree() {
  const projects = useStore((s) => s.projects)
  const rootPath = useStore((s) => s.rootPath)
  const terminals = useStore((s) => s.terminals)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
  const ql = q.toLowerCase()

  const toggle = (key: string) => {
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        /* ignore quota/privacy errors — collapse state is a nicety */
      }
      return next
    })
  }

  const all = flattenAll(projects)

  // Each project appears exactly once: Active (an agent runs on it or a worktree)
  // takes precedence over Pinned, which takes precedence over All projects.
  const isActive = (p: ProjectNode) =>
    summarizeProject(p.id, terminals).agentCount > 0 ||
    (p.children ?? []).some((w) => summarizeProject(w.id, terminals).agentCount > 0)

  const bestRank = (p: ProjectNode): number => {
    let r = statusRank(summarizeProject(p.id, terminals).status)
    for (const w of p.children ?? []) r = Math.min(r, statusRank(summarizeProject(w.id, terminals).status))
    return r
  }

  const active = all.filter(isActive).sort((a, b) => bestRank(a) - bestRank(b) || a.name.localeCompare(b.name))
  const activeIds = new Set(active.map((p) => p.id))
  const pinned = all.filter((p) => p.isPinned && !activeIds.has(p.id))
  const shownAbove = new Set([...active, ...pinned].map((p) => p.id))
  const rest = projects.filter((n) => n.kind === 'group' || !shownAbove.has(n.id))

  const matches = q
    ? all.filter(
        (p) => p.name.toLowerCase().includes(ql) || p.children?.some((c) => c.name.toLowerCase().includes(ql))
      )
    : []

  return (
    <div className="tree">
      <div className="tree-head">
        <div className="root-row">
          <span className="root-label" title={rootPath}>
            {rootPath.split('/').pop() || 'Projects'}
          </span>
          <button
            className="mini"
            onClick={() => useStore.getState().openNewProject()}
            title="New project (⌘N)"
          >
            ＋ new
          </button>
          <button className="mini" onClick={() => void useStore.getState().pickRoot()} title="Change folder">
            change
          </button>
          <button
            className="collapse-btn"
            onClick={() => useStore.getState().toggleSidebar()}
            title="Hide sidebar"
          >
            «
          </button>
        </div>
        <input
          className="tree-search"
          placeholder="Filter projects…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="tree-body">
        {q ? (
          <>
            {matches.map((n) => (
              <ProjectRow key={n.id} node={n} flat />
            ))}
            {matches.length === 0 && <div className="muted small pad">no matches</div>}
          </>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <Section
                  label="Active"
                  title="Projects with an agent open. Cycle through them with ⌃Tab / ⌃⇧Tab."
                  count={active.length}
                  open={!collapsed.active}
                  onToggle={() => toggle('active')}
                />
                {!collapsed.active && active.map((n) => <ProjectRow key={n.id} node={n} flat />)}
              </>
            )}
            {pinned.length > 0 && (
              <>
                <Section
                  label="Pinned"
                  count={pinned.length}
                  open={!collapsed.pinned}
                  onToggle={() => toggle('pinned')}
                />
                {!collapsed.pinned && pinned.map((n) => <ProjectRow key={n.id} node={n} flat />)}
              </>
            )}
            <Section
              label="All projects"
              count={all.length - shownAbove.size}
              open={!collapsed.all}
              onToggle={() => toggle('all')}
            />
            {!collapsed.all &&
              rest.map((n) =>
                n.kind === 'group' ? (
                  <GroupRow
                    key={n.id}
                    node={n}
                    open={!collapsed[`g:${n.id}`]}
                    onToggle={() => toggle(`g:${n.id}`)}
                    hide={shownAbove}
                  />
                ) : (
                  <ProjectRow key={n.id} node={n} />
                )
              )}
            {all.length === 0 && <div className="muted small pad">no projects</div>}
          </>
        )}
      </div>
    </div>
  )
}
