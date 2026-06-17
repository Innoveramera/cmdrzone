// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const flat = useStore((s) => s.flat)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  const items = flat
    .filter((p) => p.kind !== 'group')
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 12)

  const choose = (i: number) => {
    const it = items[i]
    if (it) useStore.getState().selectProject(it.id)
  }

  return (
    <div className="palette-overlay" onClick={() => useStore.getState().togglePalette(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          placeholder="Switch to project…"
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              setIdx((i) => Math.min(i + 1, items.length - 1))
              e.preventDefault()
            } else if (e.key === 'ArrowUp') {
              setIdx((i) => Math.max(i - 1, 0))
              e.preventDefault()
            } else if (e.key === 'Enter') {
              choose(idx)
            } else if (e.key === 'Escape') {
              useStore.getState().togglePalette(false)
            }
          }}
        />
        <ul>
          {items.map((p, i) => (
            <li
              key={p.id}
              className={i === idx ? 'sel' : ''}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(i)}
            >
              <span className="dot" style={{ background: p.color }} />
              <span className="pal-name">{p.name}</span>
              {p.parentPath && (
                <span className="muted small">↳ {p.parentPath.split('/').pop()}</span>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="muted">no matches</li>}
        </ul>
      </div>
    </div>
  )
}
