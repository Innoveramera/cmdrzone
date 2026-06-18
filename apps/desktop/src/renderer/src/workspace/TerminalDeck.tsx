// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useStore } from '../state/store'
import { XTermView } from '../terminal/XTermView'
import { STATUS_META } from '../lib/format'
import { SendToAgentBar } from './SendToAgentBar'

function launchCommandFor(id?: string): string {
  switch (id) {
    case 'aider':
      return 'aider'
    case 'codex':
      return 'codex'
    case 'gemini':
      return 'gemini'
    case 'opencode':
      return 'opencode'
    case 'claude-code':
    default:
      return 'claude'
  }
}

export function TerminalDeck({ projectId }: { projectId: string }) {
  const terminals = useStore((s) => s.terminals)
  const groups = useStore((s) => s.groups)
  const groupOrder = useStore((s) => s.groupOrder)
  const activeGid = useStore((s) => s.activeGroupByProject[projectId])
  const agents = useStore((s) => s.agents)
  const project = useStore((s) => s.findProject(projectId))
  const durable = useStore((s) => s.durable)

  const myGroups = groupOrder
    .map((g) => groups[g])
    .filter((g): g is NonNullable<typeof g> => !!g && g.projectId === projectId)

  const resolveProvider = () => {
    const wantId = project?.defaultProviderId ?? 'claude-code'
    return (
      agents.find((a) => a.id === wantId && a.installed) ??
      agents.find((a) => a.isDefault) ??
      agents.find((a) => a.installed)
    )
  }

  const agentOpts = (resume = false) => {
    const prov = resolveProvider()
    const pid = prov?.id ?? 'claude-code'
    const base = launchCommandFor(pid)
    return {
      kind: 'agent' as const,
      providerId: prov?.id,
      title: resume ? 'Claude ↻' : prov?.name ?? 'Claude',
      initialCommand: resume && pid === 'claude-code' ? `${base} --continue` : base
    }
  }

  const newAgent = (resume = false) => useStore.getState().newTerminal(projectId, agentOpts(resume))
  const newShell = () => useStore.getState().newTerminal(projectId, { kind: 'shell', title: 'shell' })
  const agentName = resolveProvider()?.name ?? 'Claude'

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
        <button
          className="tab add"
          onClick={() => newAgent(false)}
          title={`New ${agentName} session`}
        >
          ＋ 🤖 {agentName}
        </button>
        <button
          className="tab add"
          onClick={() => newAgent(true)}
          title={`Resume last ${agentName} session (--continue)`}
        >
          ↻ Resume
        </button>
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

      <div className="deck-body">
        {myGroups.length === 0 && (
          <div className="deck-empty muted">
            No sessions yet.{' '}
            <button className="link" onClick={() => newAgent(false)}>
              Launch Claude →
            </button>
            {' · '}
            <button className="link" onClick={() => newAgent(true)}>
              Resume (--continue)
            </button>
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
                  className={`pane ${split && isActivePane ? 'active' : ''}`}
                  onMouseDown={() => useStore.getState().setActivePane(g.id, pid)}
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
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {myGroups.length > 0 && <SendToAgentBar projectId={projectId} />}
    </div>
  )
}
