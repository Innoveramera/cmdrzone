import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { typeLabel, summarizeProject, STATUS_META, relTime } from '../lib/format'

export function ProjectCard({ node }: { node: ProjectNode }) {
  const terminals = useStore((s) => s.terminals)
  const git = useStore((s) => s.gitByPath[node.path])
  const focused = useStore((s) => s.selectedProjectId === node.id)

  if (node.kind === 'group') {
    return (
      <div className={`card group ${focused ? 'focused' : ''}`} style={{ borderTopColor: node.color }}>
        <div className="card-head">
          <span className="dot" style={{ background: node.color }} />
          <span className="card-name">{node.name}</span>
          <span className="badge">▸ {node.children?.length ?? 0}</span>
        </div>
        <div className="group-children">
          {node.children?.map((c) => {
            const sum = summarizeProject(c.id, terminals)
            const st = STATUS_META[sum.status]
            return (
              <button
                key={c.id}
                className="child-chip"
                onClick={() => useStore.getState().selectProject(c.id)}
              >
                <span className="chip-dot" style={{ background: c.color }} />
                <span className="chip-name">{c.name}</span>
                <span className="muted small">{typeLabel(c.type)}</span>
                {sum.agentCount > 0 && <span className={`pill sm ${st.cls}`}>{st.glyph}</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const sum = summarizeProject(node.id, terminals)
  const st = STATUS_META[sum.status]

  return (
    <button
      className={`card ${focused ? 'focused' : ''}`}
      style={{ borderTopColor: node.color }}
      onClick={() => useStore.getState().selectProject(node.id)}
    >
      <div className="card-head">
        <span className="dot" style={{ background: node.color }} />
        <span className="card-name">{node.name}</span>
        <span
          className={`star ${node.isPinned ? '' : 'dim'}`}
          onClick={(e) => {
            e.stopPropagation()
            void useStore.getState().togglePin(node)
          }}
        >
          {node.isPinned ? '★' : '☆'}
        </span>
      </div>
      <div className="card-row">
        <span className="badge">{typeLabel(node.type)}</span>
        {node.kind === 'docs' && <span className="badge">docs</span>}
        {node.hasClaudeMd && <span className="badge soft">CLAUDE.md</span>}
      </div>
      <div className="card-git">
        {git?.isRepo ? (
          <span>
            ⎇ {git.branch}
            {git.dirty ? ` ✎${git.dirty}` : ''}
            {git.ahead ? ` ↑${git.ahead}` : ''}
          </span>
        ) : (
          <span className="muted">no git</span>
        )}
      </div>
      <div className="card-agent">
        {sum.agentCount > 0 ? (
          <>
            <span className={`pill ${st.cls}`}>
              {st.glyph} {st.label}
            </span>
            <span className="agent-last">{sum.lastLine}</span>
          </>
        ) : (
          <span className="muted">{sum.termCount > 0 ? `•${sum.termCount} term` : 'idle'}</span>
        )}
      </div>
      <div className="card-foot muted small">
        {node.scripts ? `${Object.keys(node.scripts).length} scripts · ` : ''}
        {relTime(node.lastOpenedAt) || 'never opened'}
      </div>
    </button>
  )
}
