// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Resolve the user's *login + interactive* shell environment so spawned terminals
// and agent binaries see the exact PATH they'd have in iTerm.
//
// This is the #1 gotcha for GUI apps on macOS: launchd hands the app a minimal PATH,
// so `claude` (~/.local/bin), Volta shims (~/.volta/bin) and Homebrew (/opt/homebrew/bin)
// are all missing. We recover the real environment by running the login shell once and
// dumping its env between unique delimiters (the same trick `shell-env`/`fix-path` use).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const pexec = promisify(execFile)
const DELIM = '_SB_ENV_DELIM_8f3a2c_'

export function getUserShell(): string {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
}

/** Extra bin dirs we always make sure are on PATH, even if dotfiles are minimal. */
export function extraBinDirs(): string[] {
  const home = os.homedir()
  return [
    join(home, '.local', 'bin'),
    join(home, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

/** Dump the environment of a login+interactive shell as a key/value map. */
export async function getLoginShellEnv(): Promise<Record<string, string>> {
  if (process.platform === 'win32') {
    return { ...process.env } as Record<string, string>
  }
  const shell = getUserShell()
  try {
    const { stdout } = await pexec(
      shell,
      ['-lic', `echo ${DELIM}; env; echo ${DELIM}`],
      { maxBuffer: 8 * 1024 * 1024, timeout: 10_000 }
    )
    const start = stdout.indexOf(DELIM)
    const end = stdout.lastIndexOf(DELIM)
    if (start === -1 || end === -1 || end <= start) return {}
    const body = stdout.slice(start + DELIM.length, end)
    const env: Record<string, string> = {}
    for (const line of body.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
    }
    return env
  } catch {
    return {}
  }
}

function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Find the absolute path of a binary on the given PATH string. */
export function whichOn(bin: string, pathStr: string): string | null {
  for (const dir of pathStr.split(':')) {
    if (!dir) continue
    const candidate = join(dir, bin)
    if (isExecutable(candidate)) return candidate
  }
  return null
}

export interface ComposedEnv {
  shell: string
  home: string
  env: Record<string, string>
  /** binary name -> absolute path, or null */
  resolved: Record<string, string | null>
}

let cached: ComposedEnv | null = null

/**
 * Compose the environment used to spawn terminals: the login-shell env, with our
 * extra bin dirs guaranteed on PATH and terminal vars set. Cached after first call.
 */
export async function composeEnv(
  bins: string[] = ['claude', 'node', 'pnpm', 'npm', 'git']
): Promise<ComposedEnv> {
  if (cached) {
    // refresh only the resolved set if a different bin list is requested
    for (const b of bins) {
      if (!(b in cached.resolved)) cached.resolved[b] = whichOn(b, cached.env.PATH ?? '')
    }
    return cached
  }

  const loginEnv = await getLoginShellEnv()
  const base: Record<string, string> = { ...(process.env as Record<string, string>), ...loginEnv }

  const parts = (base.PATH ?? '').split(':').filter(Boolean)
  for (const dir of extraBinDirs()) {
    if (!parts.includes(dir)) parts.unshift(dir)
  }
  base.PATH = parts.join(':')
  base.TERM = 'xterm-256color'
  base.COLORTERM = 'truecolor'
  base.TERM_PROGRAM = 'CmdrZone'

  const resolved: Record<string, string | null> = {}
  for (const b of bins) resolved[b] = whichOn(b, base.PATH)

  cached = { shell: getUserShell(), home: os.homedir(), env: base, resolved }
  return cached
}
