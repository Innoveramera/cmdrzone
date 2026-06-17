import { useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { summarizeProject, STATUS_META } from '../lib/format'

function Row({ node, child, flat }: { node: ProjectNode; child?: boolean; flat?: boolean }) {
  const selected = useStore((s) => s.selectedProjectId === node.id)
  const terminals = useStore((s) => s.terminals)
  const git = useStore((s) => s.gitByPath[node.path])
  const sum = summarizeProject(node.id, terminals)
  const st = STATUS_META[sum.status]
  const parent = flat ? node.parentPath?.split('/').pop() : undefined
  // open non-agent session (agent sessions already show a status pill)
  const hasSession = sum.agentCount === 0 && sum.termCount > 0

  return (
    <div
      className={`trow ${child ? 'child' : ''} ${selected ? 'sel' : ''}`}
      onClick={() => useStore.getState().selectProject(node.id)}
      title={node.path}
    >
      <span className="tdot2" style={{ background: node.color }} />
      <span className="tname">{node.name}</span>
      {parent && <span className="tparent">{parent}</span>}
      {sum.agentCount > 0 && <span className={`pill sm ${st.cls}`}>{st.glyph}</span>}
      {hasSession && <span className="tsession" title="open session">●</span>}
      {git?.isRepo && git.dirty > 0 && <span className="tdirty">✎{git.dirty}</span>}
      <span
        className={`tstar ${node.isPinned ? 'on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          void useStore.getState().togglePin(node)
        }}
      >
        {node.isPinned ? '★' : '☆'}
      </span>
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
