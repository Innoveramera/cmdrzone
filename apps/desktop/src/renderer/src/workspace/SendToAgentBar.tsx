// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import { useStore } from '../state/store'

export function SendToAgentBar({ projectId }: { projectId: string }) {
  const activeId = useStore((s) => s.activeTerminalByProject[projectId])
  const tab = useStore((s) => (activeId ? s.terminals[activeId] : undefined))
  const project = useStore((s) => s.findProject(projectId))
  const [text, setText] = useState('')

  if (!tab) return null

  const send = () => {
    if (!text.trim()) return
    window.api.pty.input(tab.id, text + '\r')
    setText('')
  }

  return (
    <div className="sendbar" style={{ borderColor: tab.color }}>
      <div className="send-input">
        <input
          value={text}
          placeholder={`Message ${tab.title}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              send()
              e.preventDefault()
            }
          }}
        />
        <button onClick={send}>Send ⏎</button>
      </div>
      <div className="send-dest" style={{ color: tab.color }}>
        ▸ goes to <b>{project?.name}</b> · {tab.title}
        {tab.kind === 'agent' && tab.status === 'working' ? ' (working)' : ''}
      </div>
    </div>
  )
}
