// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Entry point for the PTY-host utilityProcess. Bridges main <-> node-pty over MessagePort.
// Runs in a Node context (no electron module import); communicates via process.parentPort.

import {
  createSession,
  writeSession,
  resizeSession,
  disposeSession,
  disposeAll
} from '@pty/session-manager'
import type { PtyCreateOptions } from '@shared/ipc'

interface ParentPortLike {
  on(event: 'message', listener: (e: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

const port = (process as unknown as { parentPort?: ParentPortLike }).parentPort
if (!port) {
  throw new Error('pty-host must run as an Electron utilityProcess')
}

type HostMessage =
  | { type: 'create'; payload: PtyCreateOptions }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'dispose'; id: string }

port.on('message', async (e) => {
  const msg = e.data as HostMessage
  switch (msg.type) {
    case 'create':
      await createSession(
        msg.payload,
        (id, data) => port.postMessage({ type: 'data', id, data }),
        (id, exitCode, signal) => port.postMessage({ type: 'exit', id, exitCode, signal })
      )
      port.postMessage({ type: 'created', id: msg.payload.id })
      break
    case 'input':
      writeSession(msg.id, msg.data)
      break
    case 'resize':
      resizeSession(msg.id, msg.cols, msg.rows)
      break
    case 'dispose':
      disposeSession(msg.id)
      break
  }
})

process.on('exit', () => disposeAll())

port.postMessage({ type: 'ready' })
