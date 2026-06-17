// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useStore } from '../state/store'
import { summarizeProject, STATUS_META } from '../lib/format'

export function FocusedBanner() {
  const selectedProjectId = useStore((s) => s.selectedProjectId)
  const terminals = useStore((s) => s.terminals)
  const gitByPath = useStore((s) => s.gitByPath)
  const project = useStore((s) => s.findProject(selectedProjectId))

  if (!project) {
    return (
      <header className="banner banner-neutral">
        <span className="brand">◧ CmdrZone</span>
        <span className="spacer" />
        <button className="ghost" onClick={() => useStore.getState().togglePalette(true)}>
          ⌘K Switch
        </button>
      </header>
    )
  }

  const sum = summarizeProject(project.id, terminals)
  const git = gitByPath[project.path]
  const st = STATUS_META[sum.status]

  return (
    <header className="banner" style={{ boxShadow: `inset 0 -2px 0 ${project.color}` }}>
      <span className="dot lg" style={{ background: project.color }} />
      <span className="b-name">{project.name}</span>
      {git?.isRepo && (
        <span className="b-git">
          ⎇ {git.branch}
          {git.dirty ? ` ✎${git.dirty}` : ''}
          {git.ahead ? ` ↑${git.ahead}` : ''}
          {git.behind ? ` ↓${git.behind}` : ''}
        </span>
      )}
      {sum.agentCount > 0 && (
        <span className={`pill ${st.cls}`}>
          {st.glyph} {st.label}
        </span>
      )}
      <span className="spacer" />
      <button className="ghost" onClick={() => useStore.getState().togglePalette(true)}>
        ⌘K Switch
      </button>
      <button className="ghost" onClick={() => useStore.getState().clearSelection()}>
        ⌘0 Dashboard
      </button>
    </header>
  )
}
