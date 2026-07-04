// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'
import { toFigmaEmbedUrl, figmaUrlHint } from '../lib/figma'

// Design view — connects a project to a Figma file/prototype/FigJam board and renders it
// live in a sandboxed iframe via Figma's Embed Kit 2.0. The connected URL is persisted as a
// per-project override (key `figmaUrl`); reading it back happens through applyPrefs() so we
// refresh() after writing to re-hydrate the node. Mounted on demand (like the Board).
export function ProjectDesign({ project }: { project: ProjectNode }) {
  const [input, setInput] = useState(project.figmaUrl ?? '')
  const [error, setError] = useState<string | null>(null)

  const parsed = project.figmaUrl ? toFigmaEmbedUrl(project.figmaUrl) : null

  const connect = async (): Promise<void> => {
    const trimmed = input.trim()
    if (!toFigmaEmbedUrl(trimmed)) {
      setError(figmaUrlHint(trimmed))
      return
    }
    setError(null)
    await window.api.projects.setPref(project.path, 'figmaUrl', trimmed)
    await useStore.getState().refresh()
  }

  const disconnect = async (): Promise<void> => {
    await window.api.projects.setPref(project.path, 'figmaUrl', null)
    await useStore.getState().refresh()
  }

  // Connected and the stored URL still parses → show the live embed.
  if (project.figmaUrl && parsed) {
    const url = project.figmaUrl
    return (
      <div className="designview">
        <div className="design-head">
          <span className="design-key" title={url}>
            🎨 {parsed.fileKey}
          </span>
          <span className="design-spacer" />
          <button className="ghost" onClick={disconnect}>
            Ändra…
          </button>
          <button className="ghost" onClick={() => window.api.shell.openExternal(url)}>
            Öppna i Figma ↗
          </button>
        </div>
        <iframe
          className="design-frame"
          title="Figma"
          src={parsed.embedUrl}
          allow="fullscreen; clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  // Empty / reconnect state.
  return (
    <div className="designview">
      <div className="design-empty">
        <div className="design-empty-title">Anslut en Figma-fil</div>
        <div className="muted design-empty-hint">
          Klistra in en länk till en Figma-fil, prototyp eller FigJam-tavla så visas den live
          här bredvid agenterna. Privata filer kräver att du loggar in i Figma i rutan.
        </div>
        <input
          className="select"
          placeholder="https://www.figma.com/design/…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void connect()
          }}
          autoFocus
        />
        {project.figmaUrl && !parsed && (
          <div className="err">Den sparade länken gick inte att tolka. Klistra in en ny.</div>
        )}
        {error && <div className="err">{error}</div>}
        <button className="ghost" onClick={() => void connect()}>
          Anslut
        </button>
      </div>
    </div>
  )
}
