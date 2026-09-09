// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { THEME_LIST } from '../theme/themes'
import type { CustomTheme } from '../theme/custom'

export function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const theme = useStore((s) => s.theme)
  const customThemes = useStore((s) => s.customThemes)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // "Create from colors" mini-form (t3-style short format: canvas + accent → everything else).
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [appearance, setAppearance] = useState<'dark' | 'light'>('dark')
  const [canvas, setCanvas] = useState('#1a1b26')
  const [accent, setAccent] = useState('#7aa2f7')

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

  const create = (): void => {
    useStore.getState().createPaletteTheme(name, appearance, canvas, accent)
    setCreating(false)
    setName('')
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
            <button className={`ghost ${creating ? 'on' : ''}`} onClick={() => setCreating((c) => !c)}>
              ✎ Create from colors
            </button>
          </div>
          {err && <div className="err small" style={{ marginTop: 6 }}>{err}</div>}
          <div className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>
            VS Code themes live in <code>~/.vscode/extensions/&lt;theme&gt;/themes/*.json</code>. Colors map onto
            the app, the terminal palette and the editor's syntax highlighting.
          </div>

          {creating && (
            <div className="theme-create">
              <input
                className="select"
                autoFocus
                placeholder="Theme name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create()
                }}
              />
              <label className="theme-create-row">
                <span>Canvas</span>
                <input type="color" value={canvas} onChange={(e) => setCanvas(e.target.value)} />
                <code>{canvas}</code>
              </label>
              <label className="theme-create-row">
                <span>Accent</span>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
                <code>{accent}</code>
              </label>
              <label className="theme-create-row">
                <span>Appearance</span>
                <select className="select" value={appearance} onChange={(e) => setAppearance(e.target.value as 'dark' | 'light')}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <div className="theme-create-preview" style={{ background: canvas, borderColor: accent }}>
                <span style={{ color: accent }}>Aa</span> preview
              </div>
              <div className="modal-actions">
                <button className="primary" onClick={create}>Create & apply</button>
                <button className="ghost" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
