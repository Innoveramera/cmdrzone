// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Dev-only cosmetic: macOS shows the running Electron.app's CFBundleName as the bold menu-bar
// title. Unpackaged that's "Electron". This patches the local dev Electron.app's Info.plist (and
// re-signs it ad-hoc, preserving entitlements so V8's JIT still works) so `pnpm dev` shows
// "CmdrZone". No-op on non-macOS and if already patched. Packaged builds use productName instead.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

if (process.platform !== 'darwin') process.exit(0)

const NAME = 'CmdrZone Dev' // dev instance is labelled distinctly from the installed app
const PB = '/usr/libexec/PlistBuddy'
const require = createRequire(import.meta.url)

try {
  const bin = require('electron') // resolves to the Electron binary path string
  if (typeof bin !== 'string') process.exit(0)
  const contents = path.resolve(path.dirname(bin), '..') // …/Electron.app/Contents
  const appPath = path.resolve(contents, '..') // …/Electron.app
  const plist = path.join(contents, 'Info.plist')
  if (!fs.existsSync(plist)) process.exit(0)

  let current = ''
  try {
    current = execFileSync(PB, ['-c', 'Print :CFBundleName', plist]).toString().trim()
  } catch {
    /* ignore */
  }
  if (current === NAME) process.exit(0) // already patched

  const setKey = (key) => {
    try {
      execFileSync(PB, ['-c', `Set :${key} ${NAME}`, plist])
    } catch {
      try {
        execFileSync(PB, ['-c', `Add :${key} string ${NAME}`, plist])
      } catch {
        /* ignore */
      }
    }
  }
  setKey('CFBundleName')
  setKey('CFBundleDisplayName')

  // Editing the bundle invalidates its signature; re-sign ad-hoc but KEEP the entitlements
  // (Electron needs the JIT entitlement or V8 crashes on Apple Silicon).
  try {
    execFileSync(
      'codesign',
      ['--force', '--sign', '-', '--preserve-metadata=entitlements,requirements,flags', appPath],
      { stdio: 'ignore' }
    )
  } catch {
    /* if signing fails the app may still run; best-effort */
  }
  console.log(`dev: Electron.app menu name -> ${NAME}`)
} catch (e) {
  console.warn('dev: could not set Electron menu name:', e?.message ?? e)
}
