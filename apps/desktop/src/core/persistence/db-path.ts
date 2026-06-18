// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Locate cmdrzone.db from OUTSIDE Electron (the CLI/MCP tools run under ELECTRON_RUN_AS_NODE,
// where the `app` API — and thus app.getPath('userData') — is unavailable). We replicate the
// per-platform userData path for the chosen instance. The app picks its instance name in
// main/index.ts: 'CmdrZone Dev' in dev, 'CmdrZone' otherwise.

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

export type Instance = 'daily' | 'dev'

export interface DbPathOptions {
  /** Explicit DB file path; wins over everything. Falls back to $CMDRZONE_DB. */
  db?: string
  /** Which app instance's data dir to use. Falls back to $CMDRZONE_INSTANCE, then 'daily'. */
  instance?: Instance
}

/** userData dir for an Electron app named `appName`, per platform (mirrors Electron's own logic). */
function userDataDir(appName: string): string {
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', appName)
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName)
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName)
  }
}

function appNameFor(instance: Instance): string {
  return instance === 'dev' ? 'CmdrZone Dev' : 'CmdrZone'
}

/** Resolve which instance to target: explicit option → $CMDRZONE_INSTANCE → 'daily'. */
export function resolveInstance(opts: DbPathOptions = {}): Instance {
  if (opts.instance) return opts.instance
  const env = (process.env.CMDRZONE_INSTANCE || '').toLowerCase()
  return env === 'dev' ? 'dev' : 'daily'
}

/**
 * Resolve the cmdrzone.db file path. Order: explicit --db → $CMDRZONE_DB → instance default.
 * Does NOT verify existence — use {@link requireDbPath} when the DB must already exist.
 */
export function resolveDbPath(opts: DbPathOptions = {}): string {
  const explicit = opts.db || process.env.CMDRZONE_DB
  if (explicit) return path.resolve(explicit)
  return path.join(userDataDir(appNameFor(resolveInstance(opts))), 'cmdrzone.db')
}

/** Like {@link resolveDbPath} but throws a helpful error if the file is missing. */
export function requireDbPath(opts: DbPathOptions = {}): string {
  const p = resolveDbPath(opts)
  if (!fs.existsSync(p)) {
    throw new Error(
      `cmdrzone.db not found at ${p}\n` +
        `Open the CmdrZone app once to create it, pass --db <path>, or set --dev / CMDRZONE_INSTANCE=dev.`
    )
  }
  return p
}
