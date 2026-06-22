// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, liveWorkspaceIds, activeAgentProjectIds, SIDEBAR_MIN, SIDEBAR_MAX } from './state/store'
import { initTerminalRouting } from './terminal/registry'
import { FocusedBanner } from './global/FocusedBanner'
import { AgentRail } from './global/AgentRail'
import { CommandPalette } from './global/CommandPalette'
import { UpdateFooter } from './global/UpdateFooter'
import { WhatsNew } from './global/WhatsNew'
import { Settings } from './global/Settings'
import { FunctionKeyBar } from './global/FunctionKeyBar'
import { ProjectTree } from './tree/ProjectTree'
import { ProjectGrid } from './overview/ProjectGrid'
import { ProjectDetail } from './workspace/ProjectDetail'

// Drag handle on the sidebar's right edge. Updates the width live; the store debounces persistence.
function SidebarResizer() {
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = useStore.getState().sidebarWidth
    document.body.style.cursor = 'col-resize'
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (ev.clientX - startX)))
      useStore.getState().setSidebarWidth(next)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return <div className="resizer" onPointerDown={onDown} title="Drag to resize" />
}

export function App() {
  const loading = useStore((s) => s.loading)
  const selectedProjectId = useStore((s) => s.selectedProjectId)
  const liveIds = useStore(useShallow(liveWorkspaceIds))
  const flat = useStore((s) => s.flat)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const sidebarWidth = useStore((s) => s.sidebarWidth)

  useEffect(() => {
    initTerminalRouting()
    void useStore.getState().initTheme()
    void useStore.getState().initLayout()
    void (async () => {
      // Restore after the scan so project layers exist to mount the reattached terminals into.
      await useStore.getState().refresh()
      await useStore.getState().restoreWorkspace()
    })()
    void useStore.getState().initUpdates()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        useStore.getState().togglePalette()
      } else if (e.metaKey && e.key === '0') {
        e.preventDefault()
        useStore.getState().clearSelection()
      } else if (e.metaKey && /^[1-9]$/.test(e.key)) {
        const pinned = useStore.getState().projects.filter((p) => p.isPinned)
        const target = pinned[parseInt(e.key, 10) - 1]
        if (target) {
          e.preventDefault()
          useStore.getState().selectProject(target.id)
        }
      } else if (e.metaKey && e.key === 't' && selectedProjectId) {
        e.preventDefault()
        useStore.getState().newTerminal(selectedProjectId, { kind: 'shell', title: 'shell' })
      } else if (e.metaKey && e.key === 'd' && selectedProjectId) {
        // ⌘D split right, ⌘⇧D split down
        e.preventDefault()
        useStore
          .getState()
          .splitActive(selectedProjectId, e.shiftKey ? 'col' : 'row', { kind: 'shell', title: 'shell' })
      } else if (e.metaKey && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        // ⌘⌥→ / ⌘⌥← cycle through projects that have an agent open (attention-needed first).
        const ids = activeAgentProjectIds(useStore.getState())
        if (ids.length === 0) return
        e.preventDefault()
        const cur = useStore.getState().selectedProjectId
        const idx = cur ? ids.indexOf(cur) : -1
        const dir = e.key === 'ArrowRight' ? 1 : -1
        const next =
          idx === -1
            ? dir === 1
              ? ids[0]!
              : ids[ids.length - 1]!
            : ids[(idx + dir + ids.length) % ids.length]!
        useStore.getState().selectProject(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedProjectId])

  // Keep the selected project's git status fresh (branch/dirty change as you work).
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const s = useStore.getState()
      const p = s.findProject(s.selectedProjectId)
      if (p) void s.loadGit(p.path)
    }, 1500)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="app">
      <FocusedBanner />
      <div className="split">
        {sidebarCollapsed ? (
          <button
            className="sidebar-reopen"
            title="Show projects"
            onClick={() => useStore.getState().toggleSidebar()}
          >
            ›
          </button>
        ) : (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <ProjectTree />
              <AgentRail />
              <UpdateFooter />
            </div>
            <SidebarResizer />
          </>
        )}
        <div className="detail">
          <div className="layer" style={{ display: selectedProjectId ? 'none' : 'block' }}>
            {loading ? <div className="loading">scanning…</div> : <ProjectGrid />}
          </div>
          {liveIds.map((id) => {
            const project = flat.find((p) => p.id === id)
            if (!project) return null
            return (
              <div
                key={id}
                className="layer"
                style={{ display: selectedProjectId === id ? 'block' : 'none' }}
              >
                <ProjectDetail project={project} />
              </div>
            )
          })}
        </div>
      </div>
      <FunctionKeyBar />
      <CommandPalette />
      <WhatsNew />
      <Settings />
    </div>
  )
}
