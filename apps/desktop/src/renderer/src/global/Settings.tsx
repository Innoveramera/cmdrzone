// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect } from 'react'
import { useStore } from '../state/store'
import { THEME_LIST } from '../theme/themes'

export function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const theme = useStore((s) => s.theme)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useStore.getState().closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

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
        </div>
      </div>
    </div>
  )
}
