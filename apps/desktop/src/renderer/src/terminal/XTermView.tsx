// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useCallback, useEffect, useRef } from 'react'
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

  // Fit to the container, but ONLY while it's actually visible. When you switch
  // to another project this pane's `.layer` becomes display:none, collapsing the
  // host to 0×0 and firing the ResizeObserver. Fitting a zero-sized host snaps
  // the terminal to FitAddon's minimum (~2×1), and `onResize` forwards that to
  // the PTY — so the agent's TUI reflows its output down to a couple columns and
  // stays compacted. Skip the fit while hidden; the ResizeObserver fires again on
  // the 0→real transition when the layer is shown, which re-fits cleanly.
  const safeFit = useCallback(() => {
    const host = hostRef.current
    if (!host || host.clientWidth === 0 || host.clientHeight === 0) return
    try {
      fitRef.current?.fit()
    } catch {
      /* not measurable yet */
    }
  }, [])

  useEffect(() => {
    const tab = useStore.getState().terminals[id]
    if (!tab || !hostRef.current) return
    const host = hostRef.current

    const term = new XTerm({
      fontFamily: 'Menlo, "SF Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 8000,
      // NOTE: do NOT set macOptionIsMeta — it hijacks Option, breaking @ $ { } [ ] \
      // on Swedish/Nordic/German keyboards where those need Option.
      // Agent TUIs (Claude, etc.) turn on mouse reporting, which makes a normal
      // click+drag get forwarded to the program instead of selecting text. Holding
      // ⌥ Option forces a real selection regardless — same as iTerm2 / Terminal.app.
      macOptionClickForcesSelection: true,
      rightClickSelectsWord: true,
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

    // ⌘C copies the current selection (only when there is one — otherwise the key
    // falls through to the program); ⌘V pastes from the system clipboard. Clipboard
    // I/O goes through the main process because the sandboxed renderer can't read it.
    // Returning false stops xterm from processing the key but does NOT preventDefault,
    // so we do it ourselves: otherwise the browser's ⌘C copies the (empty) DOM
    // selection over ours, and ⌘V fires a second, native paste.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.metaKey) return true
      if (e.code === 'KeyC' && term.hasSelection()) {
        window.api.clipboard.write(term.getSelection())
        e.preventDefault()
        return false
      }
      if (e.code === 'KeyV') {
        void window.api.clipboard.read().then((text) => {
          if (text) term.paste(text)
        })
        e.preventDefault()
        return false
      }
      return true
    })

    term.open(host)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* DOM renderer fallback */
    }
    fitRef.current = fit
    termRef.current = term
    safeFit()
    registerTerm(id, term, fit)

    // Copy-on-select. In this app the selection gets dropped the instant you release the
    // mouse, so reading it on mouseup (or via a later ⌘C) finds nothing. xterm fires
    // onSelectionChange on every rAF refresh *as you drag*, though — so capture the text
    // live, while the selection still exists, and push it to the clipboard then. The last
    // non-empty value during the drag is the full selection. Empty fires (the release
    // clearing it, or a plain click) are skipped so we never clobber the clipboard.
    let lastSel = ''
    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel && sel !== lastSel) {
        lastSel = sel
        window.api.clipboard.write(sel)
      }
    })

    term.onData((d) => window.api.pty.input(id, d))
    term.onResize(({ cols, rows }) => window.api.pty.resize(id, cols, rows))

    void window.api.pty.create({
      id,
      cwd: tab.cwd,
      cols: term.cols,
      rows: term.rows,
      initialCommand: tab.initialCommand,
      spawn: tab.spawn
    })

    const ro = new ResizeObserver(() => safeFit())
    ro.observe(host)

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
        safeFit()
        termRef.current?.focus()
      })
    }
  }, [active, safeFit])

  return <div className="xterm-host" ref={hostRef} />
}
