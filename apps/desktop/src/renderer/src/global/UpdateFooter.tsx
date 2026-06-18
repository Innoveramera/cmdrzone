// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import type { ReactNode } from 'react'
import { useStore } from '../state/store'

export function UpdateFooter() {
  const version = useStore((s) => s.appVersion)
  const update = useStore((s) => s.update)

  const openWhatsNew = (): void => useStore.getState().openWhatsNew()
  const check = (): void => void useStore.getState().checkForUpdates()
  const install = (): void => useStore.getState().installUpdate()
  const openRelease = (): void => {
    if (update.releaseUrl) window.api.shell.openExternal(update.releaseUrl)
  }

  // The right-hand status/action depends on the updater state.
  let action: ReactNode
  switch (update.status) {
    case 'downloaded':
      action = (
        <button className="uf-cta" onClick={install} title={`Restart to update to ${update.version}`}>
          ↻ Restart to update
        </button>
      )
      break
    case 'available':
      // Newer version exists but this build can't self-install → manual download.
      action = (
        <button className="uf-cta" onClick={openRelease} title="Open the release page">
          ↓ {update.version} available
        </button>
      )
      break
    case 'downloading':
      action = <span className="uf-status">Downloading… {update.percent ?? 0}%</span>
      break
    case 'checking':
      action = <span className="uf-status">Checking…</span>
      break
    case 'error':
      action = (
        <button className="link uf-link" onClick={check} title={update.error}>
          retry check
        </button>
      )
      break
    default:
      action = (
        <button className="link uf-link" onClick={check}>
          Check for updates
        </button>
      )
  }

  return (
    <footer className="update-footer">
      <button className="uf-ver" onClick={openWhatsNew} title="What's New">
        CmdrZone {version ? `v${version}` : ''}
      </button>
      <span className="spacer" />
      {action}
    </footer>
  )
}
