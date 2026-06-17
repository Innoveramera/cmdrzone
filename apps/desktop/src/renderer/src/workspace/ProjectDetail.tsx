import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { TerminalDeck } from './TerminalDeck'
import { ProjectInfo } from './ProjectInfo'
import { ProjectEditor } from './ProjectEditor'

// Right pane of the master-detail layout. Two modes — Terminals (sessions + info)
// and Editor (files + code). Both stay mounted so switching never kills a session.
export function ProjectDetail({ project }: { project: ProjectNode }) {
  const collapsed = useStore((s) => s.infoCollapsed)
  const mode = useStore((s) => s.detailMode)

  return (
    <div className="detail-pane">
      <div className="detail-tabs">
        <button
          className={`dtab ${mode === 'terminals' ? 'on' : ''}`}
          onClick={() => useStore.getState().setDetailMode('terminals')}
        >
          💻 Terminals
        </button>
        <button
          className={`dtab ${mode === 'editor' ? 'on' : ''}`}
          onClick={() => useStore.getState().setDetailMode('editor')}
        >
          📝 Editor
        </button>
      </div>

      <div className="detail-body">
        <div
          className="dmode dmode-terminals"
          style={{
            display: mode === 'terminals' ? 'grid' : 'none',
            gridTemplateColumns: collapsed ? '1fr' : '1fr 300px'
          }}
        >
          <TerminalDeck projectId={project.id} />
          {!collapsed && <ProjectInfo project={project} />}
        </div>
        <div className="dmode" style={{ display: mode === 'editor' ? 'block' : 'none' }}>
          <ProjectEditor project={project} />
        </div>
      </div>

      {mode === 'terminals' && collapsed && (
        <button
          className="info-reopen"
          title="Show project panel"
          onClick={() => useStore.getState().toggleInfo()}
        >
          ‹ PROJECT
        </button>
      )}
    </div>
  )
}
