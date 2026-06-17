// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { FileExplorer } from './FileExplorer'
import { CodeEditor } from './CodeEditor'

// VS Code-style Files + editor pane. Multiple files can be open as tabs; each editor
// stays mounted (hidden when inactive) so unsaved edits survive tab switches.
export function ProjectEditor({ project }: { project: ProjectNode }) {
  const [open, setOpen] = useState<string[]>([])
  const [active, setActive] = useState<string | undefined>()

  const openFile = (p: string) => {
    setOpen((o) => (o.includes(p) ? o : [...o, p]))
    setActive(p)
  }
  const closeFile = (p: string) => {
    setOpen((prev) => {
      const next = prev.filter((x) => x !== p)
      setActive((a) => (a === p ? next[next.length - 1] : a))
      return next
    })
  }

  return (
    <div className="editorview">
      <FileExplorer root={project.path} onSelectFile={openFile} selectedPath={active} />
      <div className="editor-main">
        <div className="editor-tabs">
          {open.map((p) => (
            <button
              key={p}
              className={`etab ${p === active ? 'on' : ''}`}
              onClick={() => setActive(p)}
              title={p}
            >
              <span className="etab-name">{p.split('/').pop()}</span>
              <span
                className="etab-x"
                onClick={(e) => {
                  e.stopPropagation()
                  closeFile(p)
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="editor-stack">
          {open.length === 0 && (
            <div className="editor-empty muted">Select a file to view / edit</div>
          )}
          {open.map((p) => (
            <div
              key={p}
              className="editor-slot"
              style={{ display: p === active ? 'flex' : 'none' }}
            >
              <CodeEditor path={p} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
