// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Trello-style board store, keyed by stable project path (survives rescans).
import { getDb } from '../persistence/database'
import type { BoardData, BoardCard, BoardColumn } from '@shared/types'

const DEFAULT_COLUMNS = ['Ideas', 'To Do', 'In Progress', 'Done']

const COLS_SQL =
  'SELECT id, project_path AS projectPath, title, position, created_at AS createdAt FROM board_columns WHERE project_path = ? ORDER BY position'
const CARDS_SQL =
  'SELECT id, project_path AS projectPath, column_id AS columnId, title, body, type, position, created_at AS createdAt, updated_at AS updatedAt FROM board_cards WHERE project_path = ? ORDER BY position'

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
  const cards = rows.map((c) => ({ ...c, body: c.body ?? '' }))
  return { columns, cards }
}

export function saveCard(card: BoardCard): void {
  getDb()
    .prepare(
      `INSERT INTO board_cards (id, project_path, column_id, title, body, type, position, created_at, updated_at)
       VALUES (@id, @projectPath, @columnId, @title, @body, @type, @position, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         column_id = excluded.column_id, title = excluded.title, body = excluded.body,
         type = excluded.type, position = excluded.position, updated_at = excluded.updated_at`
    )
    .run({ ...card, body: card.body ?? '' })
}

export function deleteCard(id: string): void {
  getDb().prepare('DELETE FROM board_cards WHERE id = ?').run(id)
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
    db.prepare('DELETE FROM board_cards WHERE column_id = ?').run(id)
    db.prepare('DELETE FROM board_columns WHERE id = ?').run(id)
  })()
}
