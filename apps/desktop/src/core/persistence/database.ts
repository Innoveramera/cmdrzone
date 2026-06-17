// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

/** Initialize the SQLite store at the given path (app userData) and run migrations. */
export function initDatabase(file: string): Database.Database {
  if (db) return db
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}
