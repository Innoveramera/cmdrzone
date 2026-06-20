// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { summarizeProject, STATUS_META } from '../lib/format'

function Row({ node, child, flat }: { node: ProjectNode; child?: boolean; flat?: boolean }) {
  // A pinned project is rendered twice (Pinned + All projects); `flat` marks the
  // Pinned-section copy. Only highlight the instance that was actually selected.
  const selected = useStore((s) => s.selectedProjectId === node.id && s.selectedPinned === !!flat)
  const terminals = useStore((s) => s.terminals)
  const git = useStore((s) => s.gitByPath[node.path])
  const sum = summarizeProject(node.id, terminals)
  const st = STATUS_META[sum.status]
  const parent = flat ? node.parentPath?.split('/').pop() : undefined
  // open non-agent session (agent sessions already show a status pill)
  const hasSession = sum.agentCount === 0 && sum.termCount > 0
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)

  const commit = () => {
    setRenaming(false)
    const next = name.trim()
    if (next && next !== node.name) void useStore.getState().renameProject(node.path, next)
    else setName(node.name)
  }

  return (
    <div
      className={`trow ${child ? 'child' : ''} ${selected ? 'sel' : ''}`}
      onClick={() => !renaming && useStore.getState().selectProject(node.id, !!flat)}
      title={`${node.path}\n(double-click name to rename)`}
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
            e.stopPropagation()
            setName(node.name)
            setRenaming(true)
          }}
        >
          {node.name}
        </span>
      )}
      {!renaming && parent && <span className="tparent">{parent}</span>}
      {!renaming && sum.agentCount > 0 && <span className={`pill sm ${st.cls}`}>{st.glyph}</span>}
      {!renaming && hasSession && (
        <span className="tsession" title="open session">
          ●
        </span>
      )}
      {!renaming && git?.isRepo && git.dirty > 0 && <span className="tdirty">✎{git.dirty}</span>}
      {!renaming && (
        <span
          className={`tstar ${node.isPinned ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            void useStore.getState().togglePin(node)
          }}
        >
          {node.isPinned ? '★' : '☆'}
        </span>
      )}
    </div>
  )
}

function GroupRow({ node }: { node: ProjectNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="tgroup">
      <div className="trow grouphdr" onClick={() => setOpen((o) => !o)}>
        <span className="tchev">{open ? '▾' : '▸'}</span>
        <span className="tfolder">{open ? '📂' : '📁'}</span>
        <span className="tname">{node.name}</span>
        <span className="tcount">{node.children?.length ?? 0}</span>
      </div>
      {open && node.children && (
        <div className="tchildren">
          {node.children.map((c) => (
            <Row key={c.id} node={c} child />
          ))}
        </div>
      )}
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
  const [q, setQ] = useState('')
  const ql = q.toLowerCase()

  const pinned = flattenAll(projects).filter((p) => p.isPinned)
  const list = projects.filter(
    (n) =>
      !q ||
      n.name.toLowerCase().includes(ql) ||
      n.children?.some((c) => c.name.toLowerCase().includes(ql))
  )

  return (
    <div className="tree">
      <div className="tree-head">
        <div className="root-row">
          <span className="root-label" title={rootPath}>
            📁 {rootPath.split('/').pop() || 'Projects'}
          </span>
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
        {!q && pinned.length > 0 && (
          <>
            <div className="tree-section">★ Pinned</div>
            {pinned.map((n) => (
              <Row key={`pin-${n.id}`} node={n} flat />
            ))}
            <div className="tree-section">All projects</div>
          </>
        )}
        {list.map((n) =>
          n.kind === 'group' ? <GroupRow key={n.id} node={n} /> : <Row key={n.id} node={n} />
        )}
        {list.length === 0 && <div className="muted small pad">no projects</div>}
      </div>
    </div>
  )
}
