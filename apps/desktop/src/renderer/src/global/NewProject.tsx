// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { resolveProvider } from '../lib/agents'
import { sanitizeProjectName } from '@shared/project-name'

// "New project" wizard (⌘N): name + "what do you want to build?" → creates <root>/<name>
// (git init, CLAUDE.md seeded with the idea) and optionally launches Claude Code with the
// idea as its very first prompt, so a brand-new project starts with context instead of blank.
export function NewProject() {
  const open = useStore((s) => s.newProjectOpen)
  const rootPath = useStore((s) => s.rootPath)
  const agents = useStore((s) => s.agents)
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [launch, setLaunch] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setIdea('')
      setLaunch(true)
      setBusy(false)
      setErr(null)
    }
  }, [open])

  if (!open) return null

  const provider = resolveProvider(agents)
  const agentReady = !!provider?.installed
  const folder = sanitizeProjectName(name)

  const create = async () => {
    if (!folder || busy) return
    setBusy(true)
    setErr(null)
    const e = await useStore.getState().createProject(name, idea, launch && agentReady)
    setBusy(false)
    if (e) setErr(e)
  }

  const close = () => !busy && useStore.getState().closeNewProject()

  return (
    <div className="modal-overlay" onClick={close}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          else if (e.key === 'Enter' && (e.metaKey || e.target instanceof HTMLInputElement)) {
            e.preventDefault()
            void create()
          }
        }}
      >
        <div className="launch-head">✦ New project</div>
        <input
          className="modal-title"
          autoFocus
          value={name}
          placeholder="Project name…"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="np-hint muted small">
          {folder ? `${rootPath}/${folder}` : 'Creates a folder in your projects root, with git + CLAUDE.md.'}
        </div>
        <textarea
          className="modal-body np-idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder={
            'What do you want to build?\n\nA couple of sentences is enough — goal, target users, stack preferences. ' +
            'This seeds the project’s CLAUDE.md and becomes the first prompt of the Claude session.'
          }
        />
        <label className={`np-check ${agentReady ? '' : 'off'}`}>
          <input
            type="checkbox"
            checked={launch && agentReady}
            disabled={!agentReady}
            onChange={(e) => setLaunch(e.target.checked)}
          />
          {agentReady
            ? `Start ${provider!.name} with this context`
            : 'No coding agent found on your PATH — the project is created without a session.'}
        </label>
        {err && <div className="launch-warn small">⚠ {err}</div>}
        <div className="modal-actions">
          <button className="primary" disabled={!folder || busy} onClick={() => void create()}>
            {busy ? 'Creating…' : launch && agentReady ? '✦ Create & start' : 'Create'}
          </button>
          <button className="ghost" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
