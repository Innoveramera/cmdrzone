import { useStore } from '../state/store'
import { STATUS_META, statusRank } from '../lib/format'

export function AgentRail() {
  const terminals = useStore((s) => s.terminals)
  const rows = Object.values(terminals)
    .filter((t) => t.kind === 'agent')
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))

  return (
    <aside className="rail">
      <div className="rail-head">Agents</div>
      {rows.length === 0 && <div className="muted small pad">no agents running</div>}
      {rows.map((t) => {
        const project = useStore.getState().findProject(t.projectId)
        const st = STATUS_META[t.status]
        return (
          <button
            key={t.id}
            className="rail-row"
            onClick={() => {
              useStore.getState().setActiveTerminal(t.projectId, t.id)
              useStore.getState().selectProject(t.projectId)
            }}
          >
            <span className="dot" style={{ background: t.color }} />
            <div className="rail-main">
              <div className="rail-top">
                <span className="rail-name">{project?.name ?? t.title}</span>
                <span className={`pill sm ${st.cls}`}>{st.glyph}</span>
              </div>
              <div className="rail-last">{t.lastLine || t.title}</div>
            </div>
          </button>
        )
      })}
    </aside>
  )
}
