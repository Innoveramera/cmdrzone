// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// In-app updater. Uses electron-updater (the electron-builder companion) to check GitHub
// Releases for a newer build and, when this app can self-install, download it and offer a
// restart. macOS only installs an update in place when the app is Developer ID-signed +
// notarized — until that's configured we run in "hybrid" notify mode: still check + surface the
// new version, but route the user to the release page to download it manually.

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import electronUpdater from 'electron-updater'
import { IPC } from '@shared/ipc'
import type { ChangelogEntry, UpdateState } from '@shared/update'
import { parseChangelog } from '@core/changelog/parse'
import { getSetting } from '@core/persistence/repos'

const { autoUpdater } = electronUpdater

const REPO_URL = 'https://github.com/Innoveramera/cmdrzone'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // re-check every 6h while running

/**
 * Whether this build can install an update in place. Leave false until the app is signed +
 * notarized (set `mac.identity` in electron-builder.yml and add notarization creds); then flip
 * this on (or run with CMDRZONE_AUTO_INSTALL=1) to enable background download + restart-to-update.
 */
const AUTO_INSTALL = process.env.CMDRZONE_AUTO_INSTALL === '1'

let win: BrowserWindow | null = null
let wired = false
let state: UpdateState = { status: 'idle', canAutoInstall: AUTO_INSTALL }

function releaseUrl(version?: string): string {
  return version ? `${REPO_URL}/releases/tag/v${version}` : `${REPO_URL}/releases/latest`
}

function emit(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch, canAutoInstall: AUTO_INSTALL }
  if (win && !win.isDestroyed()) win.webContents.send(IPC.updateState, state)
}

function updateChecksEnabled(): boolean {
  return getSetting('updateChecks', '1') === '1'
}

/** Wire electron-updater once and kick off the first (and periodic) checks. */
export function initUpdater(window: BrowserWindow): void {
  win = window
  // electron-updater throws ("dev-app-update.yml not found") and can't install when unpackaged.
  if (!app.isPackaged) return
  if (wired) return
  wired = true

  autoUpdater.autoDownload = AUTO_INSTALL
  autoUpdater.autoInstallOnAppQuit = AUTO_INSTALL

  autoUpdater.on('checking-for-update', () => emit({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    // Signed builds download automatically (autoDownload); unsigned builds just surface it.
    if (AUTO_INSTALL) {
      emit({ status: 'downloading', version: info.version, percent: 0, releaseUrl: releaseUrl(info.version) })
    } else {
      emit({ status: 'available', version: info.version, releaseUrl: releaseUrl(info.version) })
    }
  })
  autoUpdater.on('update-not-available', () => emit({ status: 'not-available', version: undefined }))
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) =>
    emit({ status: 'downloaded', version: info.version, releaseUrl: releaseUrl(info.version) })
  )
  autoUpdater.on('error', (err) => emit({ status: 'error', error: String(err?.message ?? err) }))

  if (updateChecksEnabled()) {
    // Defer the first check so startup isn't blocked on the network.
    setTimeout(() => void checkForUpdates(), 8000).unref()
    setInterval(() => {
      if (updateChecksEnabled()) void checkForUpdates()
    }, CHECK_INTERVAL_MS).unref()
  }
}

export function getUpdateState(): UpdateState {
  return state
}

/** Trigger a check now (used by the manual "Check for updates" action). Returns latest state. */
export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    emit({ status: 'not-available' })
    return state
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ status: 'error', error: String((err as Error)?.message ?? err) })
  }
  return state
}

/** Restart and apply a staged update (only valid once status === 'downloaded'). */
export function quitAndInstall(): void {
  if (state.status === 'downloaded') autoUpdater.quitAndInstall()
}

// ---- Changelog (read once, cached) ----

let changelogCache: ChangelogEntry[] | null = null

export function getChangelog(): ChangelogEntry[] {
  if (changelogCache) return changelogCache
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'CHANGELOG.md') : '', // packaged (extraResources)
    join(app.getAppPath(), 'CHANGELOG.md'),
    join(app.getAppPath(), '..', '..', 'CHANGELOG.md'), // dev: repo root from apps/desktop
    join(app.getAppPath(), '..', '..', '..', 'CHANGELOG.md')
  ]
  for (const p of candidates) {
    try {
      if (p && existsSync(p)) {
        changelogCache = parseChangelog(readFileSync(p, 'utf8'))
        return changelogCache
      }
    } catch {
      /* try next candidate */
    }
  }
  return []
}
