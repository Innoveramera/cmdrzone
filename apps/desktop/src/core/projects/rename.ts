// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Rename a project's folder on disk, then migrate everything keyed by its (now stale) path:
// board columns/cards, project preference overrides, and the last-selected setting.
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../persistence/database'
import type { RenameResult } from '@shared/types'

export function renameProjectFolder(oldPath: string, rawName: string): RenameResult {
  const name = rawName.trim()
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.') || name.includes('\0')) {
    return { ok: false, error: 'Invalid folder name' }
  }
  const newPath = path.join(path.dirname(oldPath), name)
  if (newPath === oldPath) return { ok: true, newPath: oldPath }
  if (!fs.existsSync(oldPath)) return { ok: false, error: 'Folder no longer exists' }
  if (fs.existsSync(newPath)) return { ok: false, error: 'A folder with that name already exists' }

  try {
    fs.renameSync(oldPath, newPath)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  try {
    const db = getDb()
    db.transaction(() => {
      db.prepare('UPDATE project_overrides SET project_path = ? WHERE project_path = ?').run(newPath, oldPath)
      db.prepare('UPDATE board_columns SET project_path = ? WHERE project_path = ?').run(newPath, oldPath)
      db.prepare('UPDATE board_cards SET project_path = ? WHERE project_path = ?').run(newPath, oldPath)
      db.prepare("UPDATE settings SET value = ? WHERE key = 'lastSelected' AND value = ?").run(newPath, oldPath)
    })()
  } catch {
    /* folder is already renamed; DB migration is best-effort */
  }

  return { ok: true, newPath }
}
