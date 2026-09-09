// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Tiny async wrapper over `git` / `gh` for the Changes tab. Everything here is a plain
// child process with the composed login-shell env (so Homebrew git + gh resolve) and a
// hard timeout — nothing blocks the main process.

import { execFile } from 'node:child_process'

export interface RunResult {
  ok: boolean
  out: string
  err: string
  code: number
}

export function run(
  bin: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeout?: number; input?: string; maxBuffer?: number }
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        cwd: opts.cwd,
        env: opts.env,
        timeout: opts.timeout ?? 20_000,
        maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
        encoding: 'utf8'
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null
        resolve({
          ok: !e,
          out: stdout ?? '',
          err: (stderr ?? '').trim() || (e ? e.message : ''),
          code: e && typeof e.code === 'number' ? e.code : e ? 1 : 0
        })
      }
    )
    if (opts.input !== undefined && child.stdin) {
      child.stdin.on('error', () => {
        /* the process may exit before we finish writing — the result carries the error */
      })
      child.stdin.end(opts.input)
    }
  })
}

export const git = (
  repo: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  extra: { timeout?: number; input?: string; envOverride?: NodeJS.ProcessEnv } = {}
): Promise<RunResult> =>
  run('git', args, {
    cwd: repo,
    env: extra.envOverride ? { ...env, ...extra.envOverride } : env,
    timeout: extra.timeout,
    input: extra.input
  })
