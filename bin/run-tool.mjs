// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Shared launcher: run a bundled tool (apps/desktop/out/<bundle>) under Electron-as-Node so it
// reuses the Electron-ABI better-sqlite3. We resolve Electron's binary from the desktop package
// and forward argv + stdio + the caller's cwd.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function runTool(bundle) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const require = createRequire(path.join(root, 'apps/desktop/package.json'))
  const electron = require('electron') // electron's main export is the binary path
  const entry = path.join(root, 'apps/desktop/out', bundle)

  const child = spawn(electron, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 0)
  })
}
