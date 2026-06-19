// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect } from 'react'
import { useStore, activePaneId } from '../state/store'

/** A TC-style F-key action mapped onto a real CmdrZone command. */
interface FKey {
  key: string
  label: string
  run: () => void
  /** false → greyed out + the keystroke is ignored */
  enabled: boolean
}

function buildKeys(selectedProjectId: string | null): FKey[] {
  const s = useStore.getState()
  const sel = selectedProjectId
  return [
    { key: 'F2', label: 'Dash', enabled: !!sel, run: () => s.clearSelection() },
    { key: 'F3', label: 'Board', enabled: !!sel, run: () => s.setDetailMode('board') },
    { key: 'F4', label: 'Editor', enabled: !!sel, run: () => s.setDetailMode('editor') },
    { key: 'F5', label: 'Term', enabled: !!sel, run: () => s.setDetailMode('terminals') },
    {
      key: 'F7',
      label: 'Shell',
      enabled: !!sel,
      run: () => {
        if (sel) {
          s.setDetailMode('terminals')
          s.newTerminal(sel, { kind: 'shell', title: 'shell' })
        }
      }
    },
    {
      key: 'F8',
      label: 'Close',
      enabled: !!(sel && activePaneId(s, sel)),
      run: () => {
        const id = sel ? activePaneId(s, sel) : undefined
        if (id) s.closeTerminal(id)
      }
    },
    { key: 'F10', label: 'Menu', enabled: true, run: () => s.togglePalette(true) }
  ]
}

/** Don't hijack F-keys while the user is typing in a field, terminal, or editor. */
function shouldIgnore(): boolean {
  const el = document.activeElement
  if (!el) return false
  return !!el.closest('.xterm-host, .editor-host, input, textarea')
}

export function FunctionKeyBar() {
  const theme = useStore((s) => s.theme)
  const selectedProjectId = useStore((s) => s.selectedProjectId)
  // re-render the bar's enabled-state when terminals change (affects F8)
  const groups = useStore((s) => s.groups)
  void groups

  const keys = buildKeys(selectedProjectId)

  useEffect(() => {
    if (theme !== 'totalcommander') return
    const onKey = (e: KeyboardEvent): void => {
      if (!/^F([2-9]|10)$/.test(e.key) || shouldIgnore()) return
      const k = buildKeys(useStore.getState().selectedProjectId).find((x) => x.key === e.key)
      if (!k || !k.enabled) return
      e.preventDefault()
      k.run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [theme])

  if (theme !== 'totalcommander') return null

  return (
    <div className="fkbar">
      {keys.map((k) => (
        <button key={k.key} className="ghost fkey" disabled={!k.enabled} onClick={k.run}>
          <b>{k.key}</b>
          <span>{k.label}</span>
        </button>
      ))}
    </div>
  )
}
