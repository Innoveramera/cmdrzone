// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { TerminalDeck } from './TerminalDeck'
import { ProjectInfo } from './ProjectInfo'
import { ProjectEditor } from './ProjectEditor'
import { ProjectBoard } from './ProjectBoard'

// Right pane of the master-detail layout. Three modes — Terminals (sessions + info),
// Editor (files + code), Board (ideas/features/bugs). Terminals + Editor stay mounted so
// switching never kills a session; the Board is mounted on demand (it seeds its columns lazily).
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
        <button
          className={`dtab ${mode === 'board' ? 'on' : ''}`}
          onClick={() => useStore.getState().setDetailMode('board')}
        >
          📋 Board
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
        {mode === 'board' && (
          <div className="dmode">
            <ProjectBoard project={project} />
          </div>
        )}
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
