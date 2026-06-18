// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Types for the in-app updater + changelog, shared by main, preload and renderer.
// Pure data — no electron/node imports.

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available' // a newer version exists but this build can't self-install → manual download
  | 'downloading'
  | 'downloaded' // staged and ready; restart to apply
  | 'not-available'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** the newer version, when one is known */
  version?: string
  /** download progress 0..100 while status === 'downloading' */
  percent?: number
  /** GitHub release page for the new version (manual download / full release notes) */
  releaseUrl?: string
  /** human-readable error, when status === 'error' */
  error?: string
  /**
   * Whether this build can download + install an update in place (macOS requires a
   * Developer ID-signed + notarized app). Drives the "Restart to update" vs
   * "Download" call-to-action in the UI.
   */
  canAutoInstall: boolean
}

/** One released version, parsed from a `## [version] - date` section of CHANGELOG.md. */
export interface ChangelogEntry {
  /** e.g. "0.1.0" or "Unreleased" */
  version: string
  /** ISO-ish date string from the heading, or null */
  date: string | null
  /** the markdown body of the section (### headings + `-` bullets) */
  body: string
}
