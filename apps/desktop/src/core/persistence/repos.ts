// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Thin repositories over the SQLite store. Project *preferences* (pin/hide/color/default
// provider/last-opened) are stored as overrides keyed by stable path, so a rescan never
// clobbers user intent.

import { getDb } from './database'
import type { ProjectNode } from '@shared/types'

export function getSetting(key: string, def: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? def
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}

export function getAllPrefs(): Map<string, Record<string, string>> {
  const rows = getDb()
    .prepare('SELECT project_path, key, value FROM project_overrides')
    .all() as { project_path: string; key: string; value: string }[]
  const map = new Map<string, Record<string, string>>()
  for (const r of rows) {
    const o = map.get(r.project_path) ?? {}
    o[r.key] = r.value
    map.set(r.project_path, o)
  }
  return map
}

export function setProjectPref(projectPath: string, key: string, value: string | null): void {
  if (value === null) {
    getDb()
      .prepare('DELETE FROM project_overrides WHERE project_path = ? AND key = ?')
      .run(projectPath, key)
    return
  }
  getDb()
    .prepare(
      'INSERT INTO project_overrides(project_path, key, value) VALUES(?, ?, ?) ON CONFLICT(project_path, key) DO UPDATE SET value = excluded.value'
    )
    .run(projectPath, key, value)
}

/** Merge stored preferences onto freshly scanned nodes (recurses into group children). */
export function applyPrefs(nodes: ProjectNode[], prefs: Map<string, Record<string, string>>): void {
  for (const n of nodes) {
    const p = prefs.get(n.path)
    if (p) {
      if (p.pinned !== undefined) n.isPinned = p.pinned === '1'
      if (p.hidden !== undefined) n.isHidden = p.hidden === '1'
      if (p.color) n.color = p.color
      if (p.defaultProviderId) n.defaultProviderId = p.defaultProviderId
      if (p.lastOpenedAt) n.lastOpenedAt = parseInt(p.lastOpenedAt, 10)
    }
    if (n.children) applyPrefs(n.children, prefs)
  }
}
