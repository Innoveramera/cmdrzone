// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useState } from 'react'
import type { AgentProviderInfo } from '@shared/types'
import { useStore } from '../state/store'
import { XTermView } from '../terminal/XTermView'
import { STATUS_META } from '../lib/format'
import { imageFilesFrom, droppedImagePath, quotePath } from '../lib/images'
import { providerLaunchOpts, resolveProvider, PERMISSION_MODES, isPermissionMode, supportsPermissionMode } from '../lib/agents'

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
  // Per-agent ▾ menu (start here / in a worktree / resume) and the worktree-name popover it opens.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  // The tab strip scrolls horizontally (overflow clips), so the menu is position:fixed at the caret.
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [wtFor, setWtFor] = useState<string | null>(null)
  const [wtName, setWtName] = useState('')
  const [wtBusy, setWtBusy] = useState(false)
  const [wtErr, setWtErr] = useState<string | null>(null)

  useEffect(() => {
    if (!menuFor) return
    const close = (): void => setMenuFor(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuFor])

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
  const mode = project?.permissionMode ?? 'supervised'
  const modeMeta = PERMISSION_MODES.find((m) => m.id === mode) ?? PERMISSION_MODES[0]!
  const newAgent = (provider: AgentProviderInfo, resume = false) =>
    useStore.getState().newTerminal(projectId, providerLaunchOpts(provider, resume, mode))
  const newShell = () => useStore.getState().newTerminal(projectId, { kind: 'shell', title: 'shell' })
  const wtProvider = availableAgents.find((a) => a.id === wtFor) ?? resolveProvider(agents, project)
  const agentName = wtProvider?.name ?? 'agent'
  const canWorktree = !!git?.isRepo && !project?.worktreeOf

  const createWorktree = async (): Promise<void> => {
    if (wtBusy || !wtName.trim() || !wtProvider) return
    setWtBusy(true)
    setWtErr(null)
    const err = await useStore.getState().createWorktreeAgent(projectId, wtName, wtProvider.id)
    setWtBusy(false)
    if (err) setWtErr(err)
    else {
      setWtFor(null)
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
              {active?.kind === 'agent' && active.permissionMode && active.permissionMode !== 'supervised' && (
                <span
                  className={`tab-mode mode-${active.permissionMode}`}
                  title={`${PERMISSION_MODES.find((m) => m.id === active.permissionMode)?.label ?? ''} — set when this session was launched`}
                >
                  {PERMISSION_MODES.find((m) => m.id === active.permissionMode)?.glyph}
                </span>
              )}
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
        {availableAgents.length > 0 && project && (
          <select
            className={`mode-select mode-${mode}`}
            value={mode}
            onChange={(e) => {
              if (isPermissionMode(e.target.value)) void useStore.getState().setPermissionMode(project, e.target.value)
            }}
            title={`Permission mode for new agent sessions in this project — ${modeMeta.description}${
              availableAgents.some((a) => !supportsPermissionMode(a.id, mode)) && mode !== 'supervised'
                ? `\n(${availableAgents.filter((a) => !supportsPermissionMode(a.id, mode)).map((a) => a.name).join(', ')}: no equivalent, runs supervised)`
                : ''
            }`}
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.glyph ? `${m.glyph} ` : ''}{m.label}
              </option>
            ))}
          </select>
        )}
        {availableAgents.map((agent) => (
          <span key={agent.id} className={`tab add agent-split ${menuFor === agent.id ? 'active' : ''}`}>
            <button className="split-main" onClick={() => newAgent(agent)} title={`New ${agent.name} session in this project`}>
              ＋ 🤖 {agent.name}
            </button>
            <button
              className="split-caret"
              title="More ways to start"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                const r = e.currentTarget.parentElement?.getBoundingClientRect()
                setMenuPos(r ? { x: r.left, y: r.bottom + 4 } : { x: 0, y: 0 })
                setMenuFor((m) => (m === agent.id ? null : agent.id))
              }}
            >
              ▾
            </button>
            {menuFor === agent.id && (
              <div className="agent-menu" style={{ left: menuPos.x, top: menuPos.y }} onMouseDown={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuFor(null); newAgent(agent) }}>
                  <b>Start here</b>
                  <span className="muted small">in {project?.name ?? 'this project'}</span>
                </button>
                {canWorktree && (
                  <button
                    onClick={() => {
                      setMenuFor(null)
                      setWtErr(null)
                      setWtFor(agent.id)
                    }}
                  >
                    <b>⎇ Start in a new worktree…</b>
                    <span className="muted small">isolated checkout on its own branch — run agents in parallel</span>
                  </button>
                )}
                {agent.id === 'claude-code' && (
                  <button onClick={() => { setMenuFor(null); newAgent(agent, true) }}>
                    <b>↻ Resume last conversation</b>
                    <span className="muted small">claude --continue</span>
                  </button>
                )}
              </div>
            )}
          </span>
        ))}
        <button className="tab add" onClick={newShell} title="New shell">
          ＋ $ Shell
        </button>
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

      {wtFor && wtProvider && (
        <div className="wt-pop">
          <div className="wt-pop-title">⎇ New {agentName} session in a git worktree</div>
          <div className="muted small">
            Creates an isolated checkout on branch <code>cz/&lt;name&gt;</code> and launches{' '}
            {agentName} there — run agents in parallel without stepping on each other. Merge it
            back (or discard it) from the worktree's banner when done.
          </div>
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
                else if (e.key === 'Escape') setWtFor(null)
              }}
            />
            <button className="ghost" disabled={wtBusy || !wtName.trim() || !wtProvider} onClick={() => void createWorktree()}>
              {wtBusy ? 'Creating…' : `Create & launch ${agentName}`}
            </button>
            <button className="ghost" disabled={wtBusy} onClick={() => setWtFor(null)}>
              Cancel
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
