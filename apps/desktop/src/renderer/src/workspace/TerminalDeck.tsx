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
  const order = useStore((s) => s.order)
  const activeId = useStore((s) => s.activeTerminalByProject[projectId])
  const agents = useStore((s) => s.agents)
  const project = useStore((s) => s.findProject(projectId))

  const tabs = order
    .map((id) => terminals[id])
    .filter((t): t is NonNullable<typeof t> => !!t && t.projectId === projectId)

  const resolveProvider = () => {
    const wantId = project?.defaultProviderId ?? 'claude-code'
    return (
      agents.find((a) => a.id === wantId && a.installed) ??
      agents.find((a) => a.isDefault) ??
      agents.find((a) => a.installed)
    )
  }

  const newAgent = (resume = false) => {
    const prov = resolveProvider()
    const pid = prov?.id ?? 'claude-code'
    const base = launchCommandFor(pid)
    // claude --continue resumes the most recent conversation in this folder
    const cmd = resume && pid === 'claude-code' ? `${base} --continue` : base
    useStore.getState().newTerminal(projectId, {
      kind: 'agent',
      providerId: prov?.id,
      title: resume ? 'Claude ↻' : prov?.name ?? 'Claude',
      initialCommand: cmd
    })
  }
  const newShell = () => useStore.getState().newTerminal(projectId, { kind: 'shell', title: 'shell' })

  return (
    <div className="deck">
      <div className="tabstrip">
        {tabs.map((t) => {
          const st = STATUS_META[t.status]
          return (
            <button
              key={t.id}
              className={`tab ${t.id === activeId ? 'active' : ''}`}
              onClick={() => useStore.getState().setActiveTerminal(projectId, t.id)}
            >
              {t.kind === 'agent' && (
                <span className={`tdot ${st.cls}`}>{t.exited ? '○' : st.glyph || '▶'}</span>
              )}
              <span className="tab-title">
                {t.kind === 'agent' ? '🤖 ' : t.kind === 'devserver' ? '▷ ' : '$ '}
                {t.title}
              </span>
              <span
                className="tab-x"
                onClick={(e) => {
                  e.stopPropagation()
                  useStore.getState().closeTerminal(t.id)
                }}
              >
                ×
              </span>
            </button>
          )
        })}
        <button className="tab add" onClick={() => newAgent(false)} title="New Claude session">
          ＋🤖
        </button>
        <button
          className="tab add"
          onClick={() => newAgent(true)}
          title="Resume last Claude session (claude --continue)"
        >
          ⟳
        </button>
        <button className="tab add" onClick={newShell} title="New shell">
          ＋$
        </button>
      </div>

      <div className="deck-body">
        {tabs.length === 0 && (
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
        {tabs.map((t) => (
          <div
            key={t.id}
            className="term-slot"
            style={{ display: t.id === activeId ? 'flex' : 'none' }}
          >
            <div className="term-label" style={{ borderLeftColor: t.color }}>
              <span className="dot" style={{ background: t.color }} /> {project?.name} · {t.title}
            </div>
            <div className="term-canvas">
              <XTermView id={t.id} active={t.id === activeId} />
            </div>
          </div>
        ))}
      </div>

      {tabs.length > 0 && <SendToAgentBar projectId={projectId} />}
    </div>
  )
}
