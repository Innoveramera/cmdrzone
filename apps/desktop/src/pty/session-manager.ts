// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// node-pty session manager. Runs inside the PTY-host utilityProcess (Node context),
// NOT the main process, so a chatty agent can't jank the UI and a native crash is isolated.

import * as pty from 'node-pty'
import os from 'node:os'
import { composeEnv } from '@core/env/shell-path'
import type { PtyCreateOptions } from '@shared/ipc'

interface Session {
  id: string
  proc: pty.IPty
}

const sessions = new Map<string, Session>()

type DataHandler = (id: string, data: string) => void
type ExitHandler = (id: string, exitCode: number, signal?: number) => void

let composed: Awaited<ReturnType<typeof composeEnv>> | null = null
async function ensureEnv() {
  if (!composed) composed = await composeEnv()
  return composed
}

export async function createSession(
  opts: PtyCreateOptions,
  onData: DataHandler,
  onExit: ExitHandler
): Promise<void> {
  const { env, shell } = await ensureEnv()

  // Spawn a LOGIN + INTERACTIVE shell so dotfiles load and PATH matches iTerm exactly.
  const args = process.platform === 'win32' ? [] : ['-l', '-i']
  const proc = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: Math.max(1, opts.cols || 80),
    rows: Math.max(1, opts.rows || 24),
    cwd: opts.cwd || os.homedir(),
    env: { ...env }
  })

  sessions.set(opts.id, { id: opts.id, proc })

  proc.onData((data) => onData(opts.id, data))
  proc.onExit(({ exitCode, signal }) => {
    sessions.delete(opts.id)
    onExit(opts.id, exitCode, signal)
  })

  // Agent launch / proof command: let the shell finish its init, then type the command.
  if (opts.initialCommand) {
    setTimeout(() => {
      sessions.get(opts.id)?.proc.write(opts.initialCommand + '\r')
    }, 400)
  }
}

export function writeSession(id: string, data: string): void {
  sessions.get(id)?.proc.write(data)
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const s = sessions.get(id)
  if (!s) return
  // Never resize to 0 — hidden/unmounted panes report 0 and corrupt alt-screen TUIs.
  if (cols < 1 || rows < 1) return
  try {
    s.proc.resize(cols, rows)
  } catch {
    /* pty may have exited between calls */
  }
}

export function disposeSession(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  try {
    s.proc.kill()
  } catch {
    /* already gone */
  }
}

export function disposeAll(): void {
  for (const id of [...sessions.keys()]) disposeSession(id)
}

export function runningCount(): number {
  return sessions.size
}
