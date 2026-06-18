// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../state/store'

/** Inline formatting: **bold** and `code`. Returns React nodes (no HTML injection). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>)
    else out.push(<code key={`${keyBase}-c${i}`}>{m[2]}</code>)
    last = re.lastIndex
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Render the small "Keep a Changelog" markdown subset (### headings, `-` bullets, paragraphs). */
function renderBody(body: string): ReactNode[] {
  const blocks: ReactNode[] = []
  const lines = body.split('\n')
  let list: ReactNode[] = []
  let key = 0

  const flushList = (): void => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${key++}`} className="wn-list">
          {list}
        </ul>
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const h4 = /^####\s+(.*)$/.exec(line)
    const h3 = /^###\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(<li key={`li-${key++}`}>{inline(bullet[1]!, `li-${key}`)}</li>)
    } else if (h4) {
      flushList()
      blocks.push(<h5 key={`h-${key++}`} className="wn-section">{inline(h4[1]!, `h-${key}`)}</h5>)
    } else if (h3) {
      flushList()
      blocks.push(<h5 key={`h-${key++}`} className="wn-section">{inline(h3[1]!, `h-${key}`)}</h5>)
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      blocks.push(<p key={`p-${key++}`}>{inline(line, `p-${key}`)}</p>)
    }
  }
  flushList()
  return blocks
}

export function WhatsNew() {
  const open = useStore((s) => s.whatsNewOpen)
  const changelog = useStore((s) => s.changelog)
  const version = useStore((s) => s.appVersion)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useStore.getState().closeWhatsNew()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const norm = (v: string): string => v.replace(/^v/i, '').trim()

  return (
    <div className="palette-overlay" onClick={() => useStore.getState().closeWhatsNew()}>
      <div className="wn" onClick={(e) => e.stopPropagation()}>
        <div className="wn-head">
          <span className="wn-title">What's New</span>
          <span className="spacer" />
          <button className="ghost" onClick={() => useStore.getState().closeWhatsNew()}>
            Close
          </button>
        </div>
        <div className="wn-body">
          {changelog.length === 0 && <div className="muted pad">No release notes available.</div>}
          {changelog.map((e) => (
            <section key={e.version} className="wn-entry">
              <div className="wn-ver">
                <span className="wn-ver-num">{e.version}</span>
                {version && norm(e.version) === norm(version) && (
                  <span className="pill st-done">current</span>
                )}
                {e.date && <span className="muted small">{e.date}</span>}
              </div>
              <div className="wn-content">{renderBody(e.body)}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
