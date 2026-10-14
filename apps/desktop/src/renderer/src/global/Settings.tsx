// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { THEME_LIST } from '../theme/themes'
import type { CustomTheme } from '../theme/custom'
import { ThemeEditor } from './ThemeEditor'

export function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const theme = useStore((s) => s.theme)
  const customThemes = useStore((s) => s.customThemes)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Color editor: 'new', or the custom theme being re-colored.
  const [editing, setEditing] = useState<'new' | CustomTheme | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useStore.getState().closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const importTheme = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    const e = await useStore.getState().importTheme()
    setBusy(false)
    if (e) setErr(e)
  }

  const swatch = (t: CustomTheme): [string, string, string] => [t.xterm.background, t.xterm.foreground, t.vars['--accent'] ?? t.xterm.cursor]

  return (
    <div className="palette-overlay" onClick={() => useStore.getState().closeSettings()}>
      <div className="wn settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">⚙ Settings</span>
          <span className="spacer" />
          <button className="ghost" onClick={() => useStore.getState().closeSettings()}>
            Close
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-label">Theme</div>
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              className={`theme-opt ${theme === t.id ? 'on' : ''}`}
              onClick={() => useStore.getState().setTheme(t.id)}
            >
              <span className="theme-swatch">
                <i style={{ background: t.xterm.background }} />
                <i style={{ background: t.xterm.foreground }} />
                <i style={{ background: t.xterm.cursor }} />
              </span>
              <span className="theme-opt-main">
                <span className="theme-opt-name">
                  {t.label}
                  {theme === t.id && <span className="theme-opt-check">✓</span>}
                </span>
                <span className="theme-opt-desc">{t.description}</span>
              </span>
            </button>
          ))}

          {customThemes.length > 0 && <div className="settings-label" style={{ marginTop: 14 }}>Your themes</div>}
          {customThemes.map((t) => (
            <button
              key={t.id}
              className={`theme-opt ${theme === t.id ? 'on' : ''}`}
              onClick={() => useStore.getState().setTheme(t.id)}
            >
              <span className="theme-swatch">
                {swatch(t).map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="theme-opt-main">
                <span className="theme-opt-name">
                  {t.label}
                  {theme === t.id && <span className="theme-opt-check">✓</span>}
                  <span className="spacer" />
                  <span
                    className="theme-act"
                    title="Edit colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(t)
                    }}
                  >
                    ✎
                  </span>
                  <span
                    className="theme-act"
                    title="Export as JSON"
                    onClick={(e) => {
                      e.stopPropagation()
                      void useStore.getState().exportCustomTheme(t.id)
                    }}
                  >
                    ⇩
                  </span>
                  <span
                    className="theme-act danger"
                    title="Delete theme"
                    onClick={(e) => {
                      e.stopPropagation()
                      useStore.getState().deleteCustomTheme(t.id)
                    }}
                  >
                    ✕
                  </span>
                </span>
                <span className="theme-opt-desc">{t.description}</span>
              </span>
            </button>
          ))}

          <div className="theme-tools">
            <button className="ghost" disabled={busy} onClick={() => void importTheme()} title="Import a VS Code color theme (.json) or a CmdrZone theme export">
              {busy ? 'Importing…' : '⇪ Import VS Code theme…'}
            </button>
            <button className={`ghost ${editing === 'new' ? 'on' : ''}`} onClick={() => setEditing((e) => (e === 'new' ? null : 'new'))}>
              ✎ Create from colors
            </button>
          </div>
          {err && <div className="err small" style={{ marginTop: 6 }}>{err}</div>}
          <div className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>
            VS Code themes live in <code>~/.vscode/extensions/&lt;theme&gt;/themes/*.json</code>. Colors map onto
            the app, the terminal palette and the editor's syntax highlighting.
          </div>

          {editing && (
            <ThemeEditor
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
