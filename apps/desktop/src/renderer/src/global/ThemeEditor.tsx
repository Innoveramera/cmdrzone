// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The color editor in Settings: canvas + accent derive a full palette, and every token can then
// be overridden one by one. The draft is applied to the whole app while the editor is open (live
// preview) and the saved theme is restored when it closes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { applyThemeToDom } from '../theme/themes'
import {
  type CustomTheme,
  type TokenKey,
  CUSTOM_DOM_ID,
  TOKEN_GROUPS,
  applyCustomThemeCss,
  deriveTokens
} from '../theme/custom'

export function ThemeEditor({ initial, onDone }: { initial?: CustomTheme; onDone: () => void }) {
  const [name, setName] = useState(initial?.label ?? '')
  const [appearance, setAppearance] = useState<'dark' | 'light'>(initial?.appearance ?? 'dark')
  const [canvas, setCanvas] = useState(initial?.vars['--bg'] ?? '#1a1b26')
  const [accent, setAccent] = useState(initial?.vars['--accent'] ?? '#7aa2f7')
  // Overrides on top of the derived palette. Editing a theme starts from all of its colors (so it
  // reproduces exactly); canvas + accent live in their own state.
  const [colors, setColors] = useState<Record<string, string>>(() => {
    const { '--bg': _bg, '--accent': _acc, ...rest } = initial?.vars ?? {}
    void [_bg, _acc]
    return rest
  })
  const [showAll, setShowAll] = useState(!!initial)
  const rootRef = useRef<HTMLDivElement>(null)

  // Opens under the theme list — bring it into view in the (scrolling) settings body.
  useEffect(() => rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), [])

  const vars = useMemo(() => deriveTokens(canvas, accent, appearance, colors), [canvas, accent, appearance, colors])
  const overridden = Object.keys(colors).length

  // Live preview: paint the draft over the app; put the real theme back on close.
  useEffect(() => {
    applyCustomThemeCss({ vars, appearance })
    document.documentElement.dataset.theme = CUSTOM_DOM_ID
  }, [vars, appearance])
  useEffect(
    () => () => {
      const s = useStore.getState()
      applyThemeToDom(s.theme, s.customThemes)
    },
    []
  )

  const setToken = (k: TokenKey, v: string): void => {
    if (k === '--bg') return setCanvas(v)
    if (k === '--accent') return setAccent(v)
    setColors((c) => ({ ...c, [k]: v }))
  }
  const resetToken = (k: TokenKey): void =>
    setColors((c) => {
      const { [k]: _gone, ...rest } = c
      void _gone
      return rest
    })

  const save = (): void => {
    useStore.getState().saveColorTheme({ id: initial?.id, name, appearance, canvas, accent, colors })
    onDone()
  }

  return (
    <div className="theme-create" ref={rootRef}>
      <div className="theme-create-title">{initial ? `Edit “${initial.label}”` : 'New theme'}</div>
      <input
        className="select"
        autoFocus
        placeholder="Theme name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
        }}
      />
      <label className="theme-create-row">
        <span>Appearance</span>
        <select className="select" value={appearance} onChange={(e) => setAppearance(e.target.value as 'dark' | 'light')}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
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

      <div className="theme-create-bar">
        <button className={`ghost ${showAll ? 'on' : ''}`} onClick={() => setShowAll((v) => !v)}>
          {showAll ? '▾' : '▸'} All colors
        </button>
        <span className="muted small">
          {overridden > 0 ? `${overridden} set by hand` : 'Derived from canvas + accent'}
        </span>
        <span className="spacer" />
        {overridden > 0 && (
          <button className="ghost" title="Drop the hand-set colors and derive everything from canvas + accent" onClick={() => setColors({})}>
            Reset all
          </button>
        )}
      </div>

      {showAll &&
        TOKEN_GROUPS.map((g) => (
          <div key={g.label} className="token-group">
            <div className="token-group-label">{g.label}</div>
            <div className="token-grid">
              {g.tokens.map(([k, label]) => {
                const own = k in colors
                return (
                  <label key={k} className={`token-row ${own ? 'own' : ''}`} title={k}>
                    <input type="color" value={vars[k]} onChange={(e) => setToken(k, e.target.value)} />
                    <span className="token-name">{label}</span>
                    {own ? (
                      <span
                        className="theme-act"
                        title="Back to the derived color"
                        onClick={(e) => {
                          e.preventDefault()
                          resetToken(k)
                        }}
                      >
                        ↺
                      </span>
                    ) : (
                      <code>{vars[k]}</code>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        ))}

      <div className="muted small">Previewing live — the whole app shows the draft until you save or cancel.</div>
      <div className="modal-actions">
        <button className="primary" onClick={save}>
          {initial ? 'Save' : 'Create & apply'}
        </button>
        <button className="ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}
