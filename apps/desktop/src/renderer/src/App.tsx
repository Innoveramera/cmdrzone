import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, liveWorkspaceIds } from './state/store'
import { initTerminalRouting } from './terminal/registry'
import { FocusedBanner } from './global/FocusedBanner'
import { AgentRail } from './global/AgentRail'
import { CommandPalette } from './global/CommandPalette'
import { ProjectTree } from './tree/ProjectTree'
import { ProjectGrid } from './overview/ProjectGrid'
import { ProjectDetail } from './workspace/ProjectDetail'

export function App() {
  const loading = useStore((s) => s.loading)
  const selectedProjectId = useStore((s) => s.selectedProjectId)
  const liveIds = useStore(useShallow(liveWorkspaceIds))
  const flat = useStore((s) => s.flat)

  useEffect(() => {
    initTerminalRouting()
    void useStore.getState().refresh()
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
        <div className="sidebar">
          <ProjectTree />
          <AgentRail />
        </div>
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
      <CommandPalette />
    </div>
  )
}
