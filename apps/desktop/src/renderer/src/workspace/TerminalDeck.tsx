// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import type { AgentProviderInfo } from '@shared/types'
import { useStore } from '../state/store'
import { XTermView } from '../terminal/XTermView'
import { STATUS_META } from '../lib/format'
import { imageFilesFrom, droppedImagePath, quotePath } from '../lib/images'
import { providerLaunchOpts, resolveProvider } from '../lib/agents'

export function TerminalDeck({ projectId }: { projectId: string }) {
  const terminals = useStore((s) => s.terminals)
  const groups = useStore((s) => s.groups)
  const groupOrder = useStore((s) => s.groupOrder)
  const activeGid = useStore((s) => s.activeGroupByProject[projectId])
  const agents = useStore((s) => s.agents)
  const project = useStore((s) => s.findProject(projectId))
  const durable = useStore((s) => s.durable)
  const git = useStore((s) => (project ? s.gitByPath[project.path] : undefined))
  // Which pane is under an active image drag (for the drop overlay).
  const [dropPane, setDropPane] = useState<string | null>(null)
  // "New agent in worktree" popover state.
  const [wtOpen, setWtOpen] = useState(false)
  const [wtName, setWtName] = useState('')
  const [wtBusy, setWtBusy] = useState(false)
  const [wtErr, setWtErr] = useState<string | null>(null)
  const [wtProviderId, setWtProviderId] = useState('')

  // Save the dropped image(s) and type their path(s) into the pane's PTY — no Enter, so the
  // user can add context and submit. Claude Code reads the image straight from the path.
  const dropImages = (paneId: string, groupId: string, dt: DataTransfer): void => {
    const files = imageFilesFrom(dt)
    if (files.length === 0) return
    useStore.getState().setActivePane(groupId, paneId)
    void Promise.all(files.map(droppedImagePath)).then((paths) => {
      window.api.pty.input(paneId, paths.map(quotePath).join(' ') + ' ')
    })
  }

  const myGroups = groupOrder
    .map((g) => groups[g])
    .filter((g): g is NonNullable<typeof g> => !!g && g.projectId === projectId)

  const availableAgents = agents.filter((a) => a.installed)
  const claude = availableAgents.find((a) => a.id === 'claude-code')
  const newAgent = (provider: AgentProviderInfo, resume = false) =>
    useStore.getState().newTerminal(projectId, providerLaunchOpts(provider, resume))
  const newShell = () => useStore.getState().newTerminal(projectId, { kind: 'shell', title: 'shell' })
  const wtProvider = availableAgents.find((a) => a.id === wtProviderId) ?? resolveProvider(agents, project)
  const agentName = wtProvider?.name ?? 'agent'

  const createWorktree = async (): Promise<void> => {
    if (wtBusy || !wtName.trim() || !wtProvider) return
    setWtBusy(true)
    setWtErr(null)
    const err = await useStore.getState().createWorktreeAgent(projectId, wtName, wtProvider.id)
    setWtBusy(false)
    if (err) setWtErr(err)
    else {
      setWtOpen(false)
      setWtName('')
    }
  }

  return (
    <div className="deck">
      <div className="tabstrip">
        {myGroups.map((g) => {
          const active = terminals[g.activePaneId]
          const st = STATUS_META[active?.status ?? 'idle']
          return (
            <button
              key={g.id}
              className={`tab ${g.id === activeGid ? 'active' : ''}`}
              onClick={() => useStore.getState().setActiveGroup(projectId, g.id)}
            >
              {active?.kind === 'agent' && (
                <span className={`tdot ${st.cls}`}>{active.exited ? '○' : st.glyph || '▶'}</span>
              )}
              <span className="tab-title">
                {active?.kind === 'agent' ? '🤖 ' : active?.kind === 'devserver' ? '▷ ' : '$ '}
                {active?.title}
              </span>
              {g.paneIds.length > 1 && <span className="tab-badge">⊞{g.paneIds.length}</span>}
              <span
                className="tab-x"
                onClick={(e) => {
                  e.stopPropagation()
                  ;[...g.paneIds].forEach((pid) => useStore.getState().closeTerminal(pid))
                }}
              >
                ×
              </span>
            </button>
          )
        })}
        <span className="tabstrip-div" />
        {availableAgents.map((agent) => (
          <button
            key={agent.id}
            className="tab add"
            onClick={() => newAgent(agent)}
            title={`New ${agent.name} session`}
          >
            ＋ 🤖 {agent.name}
          </button>
        ))}
        {claude && (
          <button
            className="tab add"
            onClick={() => newAgent(claude, true)}
            title="Resume last Claude Code session (--continue)"
          >
            ↻ Resume Claude
          </button>
        )}
        <button className="tab add" onClick={newShell} title="New shell">
          ＋ $ Shell
        </button>
        {availableAgents.length > 0 && git?.isRepo && !project?.worktreeOf && (
          <button
            className={`tab add ${wtOpen ? 'active' : ''}`}
            onClick={() => setWtOpen((o) => !o)}
            title="New agent in an isolated git worktree — work in parallel on its own branch, no file collisions"
          >
            ＋ ⎇ Worktree
          </button>
        )}
        <span className="spacer" />
        {durable?.available ? (
          <button
            className={`durable-pill ${durable.enabled ? 'on' : 'off'}`}
            onClick={() => void useStore.getState().toggleDurable()}
            title={
              durable.enabled
                ? 'Durable sessions ON — agents survive reload & quit (running in tmux). Click to disable.'
                : 'Durable sessions OFF — sessions end when the app closes. Click to enable.'
            }
          >
            ⛓ {durable.enabled ? 'Durable' : 'Off'}
          </button>
        ) : (
          <span className="durable-pill missing" title="Install tmux (brew install tmux) for sessions that survive reload & quit.">
            ⛓ no tmux
          </span>
        )}
      </div>

      {wtOpen && (
        <div className="wt-pop">
          <div className="wt-pop-title">⎇ New agent in a git worktree</div>
          <div className="muted small">
            Creates an isolated checkout on branch <code>cz/&lt;name&gt;</code> and launches{' '}
            {agentName} there — run agents in parallel without stepping on each other. Merge it
            back (or discard it) from the worktree's banner when done.
          </div>
          <label className="wt-pop-row">
            Agent
            <select
              className="select"
              value={wtProvider?.id ?? ''}
              disabled={wtBusy}
              onChange={(e) => setWtProviderId(e.target.value)}
            >
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
          <div className="wt-pop-row">
            <input
              className="select"
              autoFocus
              placeholder="name, e.g. fix-login"
              value={wtName}
              disabled={wtBusy}
              onChange={(e) => setWtName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createWorktree()
                else if (e.key === 'Escape') setWtOpen(false)
              }}
            />
            <button className="ghost" disabled={wtBusy || !wtName.trim() || !wtProvider} onClick={() => void createWorktree()}>
              {wtBusy ? 'Creating…' : `Create & launch ${agentName}`}
            </button>
          </div>
          {wtErr && <div className="err">{wtErr}</div>}
        </div>
      )}

      <div className="deck-body">
        {myGroups.length === 0 && (
          <div className="deck-empty muted">
            {availableAgents.length > 0
              ? 'No sessions yet. Choose an agent above to start. You can run different agents side by side.'
              : 'No AI agents detected. Install an agent CLI and refresh projects, or open a shell above.'}
          </div>
        )}
        {myGroups.map((g) => (
          <div
            key={g.id}
            className="panes"
            style={{
              display: g.id === activeGid ? 'flex' : 'none',
              flexDirection: g.dir === 'col' ? 'column' : 'row'
            }}
          >
            {g.paneIds.map((pid) => {
              const t = terminals[pid]
              if (!t) return null
              const isActivePane = pid === g.activePaneId
              const split = g.paneIds.length > 1
              return (
                <div
                  key={pid}
                  className={`pane ${split && isActivePane ? 'active' : ''}${dropPane === pid ? ' drop-target' : ''}`}
                  onMouseDown={() => useStore.getState().setActivePane(g.id, pid)}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('Files')) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    if (dropPane !== pid) setDropPane(pid)
                  }}
                  onDragLeave={(e) => {
                    // Ignore moves onto a child element; only clear when truly leaving the pane.
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                    setDropPane((cur) => (cur === pid ? null : cur))
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropPane(null)
                    dropImages(pid, g.id, e.dataTransfer)
                  }}
                >
                  <div className="term-label" style={{ borderLeftColor: t.color }}>
                    <span className="dot" style={{ background: t.color }} />
                    <span className="pane-name">{t.title}</span>
                    <span className="spacer" />
                    <span
                      className="pane-btn"
                      title="Split right"
                      onClick={(e) => {
                        e.stopPropagation()
                        useStore.getState().setActivePane(g.id, pid)
                        useStore.getState().splitActive(projectId, 'row', { kind: 'shell', title: 'shell' })
                      }}
                    >
                      ⬌
                    </span>
                    <span
                      className="pane-btn"
                      title="Split down"
                      onClick={(e) => {
                        e.stopPropagation()
                        useStore.getState().setActivePane(g.id, pid)
                        useStore.getState().splitActive(projectId, 'col', { kind: 'shell', title: 'shell' })
                      }}
                    >
                      ⬍
                    </span>
                    <span
                      className="pane-btn"
                      title="Close pane"
                      onClick={(e) => {
                        e.stopPropagation()
                        useStore.getState().closeTerminal(pid)
                      }}
                    >
                      ×
                    </span>
                  </div>
                  <div className="term-canvas">
                    <XTermView id={pid} active={isActivePane && g.id === activeGid} />
                  </div>
                  {dropPane === pid && (
                    <div className="pane-drop">🖼 Drop image — its path is inserted at the prompt</div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
