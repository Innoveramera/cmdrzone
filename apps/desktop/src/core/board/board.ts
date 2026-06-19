// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Trello-style board store, keyed by stable project path (survives rescans).
import fs from 'node:fs'
import { getDb } from '../persistence/database'
import type { BoardData, BoardCard, BoardColumn, CardAttachment } from '@shared/types'

const DEFAULT_COLUMNS = ['Ideas', 'To Do', 'In Progress', 'Done']

const COLS_SQL =
  'SELECT id, project_path AS projectPath, title, position, created_at AS createdAt FROM board_columns WHERE project_path = ? ORDER BY position'
const CARDS_SQL =
  'SELECT id, project_path AS projectPath, column_id AS columnId, title, body, type, position, created_at AS createdAt, updated_at AS updatedAt FROM board_cards WHERE project_path = ? ORDER BY position'
// On-disk path is kept private to main/core; the renderer only ever sees the czfile:// url.
const ATTACH_COLS =
  'id, card_id AS cardId, project_path AS projectPath, name, mime, path, position, created_at AS createdAt'
const ATTACH_BY_PROJECT_SQL = `SELECT ${ATTACH_COLS} FROM board_card_attachments WHERE project_path = ? ORDER BY position`

type AttachRow = Omit<CardAttachment, 'url'>

/** czfile:// scheme is served by the main process; lets the sandboxed renderer <img> the file. */
const attachmentUrl = (id: string): string => `czfile://media/${id}`
const withUrl = (r: AttachRow): CardAttachment => ({ ...r, url: attachmentUrl(r.id) })

export function getBoard(projectPath: string): BoardData {
  const db = getDb()
  let columns = db.prepare(COLS_SQL).all(projectPath) as BoardColumn[]
  if (columns.length === 0) {
    const now = Date.now()
    const insert = db.prepare(
      'INSERT INTO board_columns (id, project_path, title, position, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    db.transaction(() => {
      DEFAULT_COLUMNS.forEach((title, i) => insert.run(`col-${now}-${i}`, projectPath, title, i, now))
    })()
    columns = db.prepare(COLS_SQL).all(projectPath) as BoardColumn[]
  }
  const rows = db.prepare(CARDS_SQL).all(projectPath) as BoardCard[]
  const attachRows = db.prepare(ATTACH_BY_PROJECT_SQL).all(projectPath) as AttachRow[]
  const byCard = new Map<string, CardAttachment[]>()
  for (const r of attachRows) {
    const list = byCard.get(r.cardId) ?? []
    list.push(withUrl(r))
    byCard.set(r.cardId, list)
  }
  const cards = rows.map((c) => ({ ...c, body: c.body ?? '', attachments: byCard.get(c.id) ?? [] }))
  return { columns, cards }
}

export function getCard(id: string): BoardCard | undefined {
  const row = getDb()
    .prepare(
      'SELECT id, project_path AS projectPath, column_id AS columnId, title, body, type, position, created_at AS createdAt, updated_at AS updatedAt FROM board_cards WHERE id = ?'
    )
    .get(id) as BoardCard | undefined
  return row ? { ...row, body: row.body ?? '' } : undefined
}

export function saveCard(card: BoardCard): void {
  // Bind an explicit whitelist — `card` may carry `attachments` (not a column), which
  // better-sqlite3 would reject as an unknown named parameter.
  getDb()
    .prepare(
      `INSERT INTO board_cards (id, project_path, column_id, title, body, type, position, created_at, updated_at)
       VALUES (@id, @projectPath, @columnId, @title, @body, @type, @position, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         column_id = excluded.column_id, title = excluded.title, body = excluded.body,
         type = excluded.type, position = excluded.position, updated_at = excluded.updated_at`
    )
    .run({
      id: card.id,
      projectPath: card.projectPath,
      columnId: card.columnId,
      title: card.title,
      body: card.body ?? '',
      type: card.type,
      position: card.position,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt
    })
}

export function deleteCard(id: string): void {
  const db = getDb()
  db.transaction(() => {
    unlinkAttachmentFiles(attachmentPathsForCards([id]))
    db.prepare('DELETE FROM board_card_attachments WHERE card_id = ?').run(id)
    db.prepare('DELETE FROM board_cards WHERE id = ?').run(id)
  })()
}

export function saveColumn(col: BoardColumn): void {
  getDb()
    .prepare(
      `INSERT INTO board_columns (id, project_path, title, position, created_at)
       VALUES (@id, @projectPath, @title, @position, @createdAt)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, position = excluded.position`
    )
    .run(col)
}

export function deleteColumn(id: string): void {
  const db = getDb()
  db.transaction(() => {
    const cardIds = (
      db.prepare('SELECT id FROM board_cards WHERE column_id = ?').all(id) as { id: string }[]
    ).map((r) => r.id)
    unlinkAttachmentFiles(attachmentPathsForCards(cardIds))
    db.prepare('DELETE FROM board_card_attachments WHERE card_id IN (SELECT id FROM board_cards WHERE column_id = ?)').run(id)
    db.prepare('DELETE FROM board_cards WHERE column_id = ?').run(id)
    db.prepare('DELETE FROM board_columns WHERE id = ?').run(id)
  })()
}

// ---- attachments ----

/** Insert an attachment row. The file is written to disk by the caller (main) beforehand. */
export function addAttachment(att: AttachRow): CardAttachment {
  const max =
    (
      getDb()
        .prepare('SELECT MAX(position) AS m FROM board_card_attachments WHERE card_id = ?')
        .get(att.cardId) as { m: number | null }
    ).m ?? 0
  const row: AttachRow = { ...att, position: max + 1 }
  getDb()
    .prepare(
      `INSERT INTO board_card_attachments (id, card_id, project_path, name, mime, path, position, created_at)
       VALUES (@id, @cardId, @projectPath, @name, @mime, @path, @position, @createdAt)`
    )
    .run(row)
  return withUrl(row)
}

/** Look up an attachment's on-disk path + mime (used by the czfile:// protocol handler). */
export function getAttachment(id: string): { path: string; mime: string } | undefined {
  return getDb()
    .prepare('SELECT path, mime FROM board_card_attachments WHERE id = ?')
    .get(id) as { path: string; mime: string } | undefined
}

export function deleteAttachment(id: string): void {
  const db = getDb()
  const row = db.prepare('SELECT path FROM board_card_attachments WHERE id = ?').get(id) as
    | { path: string }
    | undefined
  if (row) unlinkAttachmentFiles([row.path])
  db.prepare('DELETE FROM board_card_attachments WHERE id = ?').run(id)
}

function attachmentPathsForCards(cardIds: string[]): string[] {
  if (cardIds.length === 0) return []
  const placeholders = cardIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT path FROM board_card_attachments WHERE card_id IN (${placeholders})`)
    .all(...cardIds) as { path: string }[]
  return rows.map((r) => r.path)
}

function unlinkAttachmentFiles(paths: string[]): void {
  for (const p of paths) {
    try {
      fs.rmSync(p, { force: true })
    } catch {
      /* best-effort: a missing file is fine */
    }
  }
}
