// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Lightweight git status via `git status --porcelain=v2 --branch`. Cheap and accurate.
import { execFile } from 'node:child_process'
import type { GitStatus } from '@shared/types'

const NOT_REPO: GitStatus = { isRepo: false, dirty: 0, ahead: 0, behind: 0 }

export function gitStatus(
  dir: string,
  gitBin = 'git',
  env: NodeJS.ProcessEnv = process.env
): Promise<GitStatus> {
  return new Promise((resolve) => {
    execFile(
      gitBin,
      ['-C', dir, 'status', '--porcelain=v2', '--branch'],
      { timeout: 5000, env, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(NOT_REPO)
        let branch: string | undefined
        let ahead = 0
        let behind = 0
        let dirty = 0
        for (const line of stdout.split('\n')) {
          if (line.startsWith('# branch.head ')) {
            branch = line.slice('# branch.head '.length).trim()
          } else if (line.startsWith('# branch.ab ')) {
            const m = line.match(/\+(\d+)\s+-(\d+)/)
            if (m) {
              ahead = parseInt(m[1]!, 10)
              behind = parseInt(m[2]!, 10)
            }
          } else if (
            line.startsWith('1 ') ||
            line.startsWith('2 ') ||
            line.startsWith('u ') ||
            line.startsWith('? ')
          ) {
            dirty++
          }
        }
        resolve({ isRepo: true, branch, dirty, ahead, behind })
      }
    )
  })
}
