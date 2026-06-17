// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import '@xterm/xterm/css/xterm.css'
import { registerTerm, unregisterTerm } from './registry'
import { useStore } from '../state/store'

const THEME = {
  background: '#0b0d12',
  foreground: '#d7dce5',
  cursor: '#9bb4ff',
  selectionBackground: '#2b3650'
}

export function XTermView({ id, active }: { id: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<XTerm | null>(null)

  useEffect(() => {
    const tab = useStore.getState().terminals[id]
    if (!tab || !hostRef.current) return

    const term = new XTerm({
      fontFamily: 'Menlo, "SF Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 8000,
      // NOTE: do NOT set macOptionIsMeta — it hijacks Option, breaking @ $ { } [ ] \
      // on Swedish/Nordic/German keyboards where those need Option.
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const uni = new Unicode11Addon()
    term.loadAddon(uni)
    term.unicode.activeVersion = '11'
    term.loadAddon(new WebLinksAddon((_e, uri) => window.api.shell.openExternal(uri)))
    term.loadAddon(new ClipboardAddon())
    term.loadAddon(new SearchAddon())
    term.loadAddon(new SerializeAddon())

    term.open(hostRef.current)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* DOM renderer fallback */
    }
    fit.fit()

    fitRef.current = fit
    termRef.current = term
    registerTerm(id, term, fit)

    term.onData((d) => window.api.pty.input(id, d))
    term.onResize(({ cols, rows }) => window.api.pty.resize(id, cols, rows))

    void window.api.pty.create({
      id,
      cwd: tab.cwd,
      cols: term.cols,
      rows: term.rows,
      initialCommand: tab.initialCommand
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* hidden */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      unregisterTerm(id)
      window.api.pty.dispose(id)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit()
        } catch {
          /* hidden */
        }
        termRef.current?.focus()
      })
    }
  }, [active])

  return <div className="xterm-host" ref={hostRef} />
}
