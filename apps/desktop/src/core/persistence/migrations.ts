// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Forward-only migrations keyed off SQLite's user_version pragma.
import type DatabaseType from 'better-sqlite3'

type Migration = (db: DatabaseType.Database) => void

const MIGRATIONS: Migration[] = [
  // v1 — initial schema
  (db) => {
    db.exec(`
      CREATE TABLE groups (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        root_path   TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE projects (
        id                  TEXT PRIMARY KEY,
        group_id            TEXT REFERENCES groups(id) ON DELETE SET NULL,
        name                TEXT NOT NULL,
        path                TEXT NOT NULL UNIQUE,
        type                TEXT NOT NULL DEFAULT 'unknown',
        default_provider_id TEXT,
        color               TEXT,
        is_pinned           INTEGER NOT NULL DEFAULT 0,
        is_hidden           INTEGER NOT NULL DEFAULT 0,
        sort                INTEGER NOT NULL DEFAULT 0,
        last_opened_at      INTEGER
      );

      -- Overrides are keyed by stable path (project ids are regenerated on rescan).
      CREATE TABLE project_overrides (
        project_path TEXT NOT NULL,
        key          TEXT NOT NULL,
        value        TEXT,
        PRIMARY KEY (project_path, key)
      );

      CREATE TABLE agent_providers (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        command    TEXT NOT NULL,
        args_json  TEXT,
        env_json   TEXT,
        detect_json TEXT,
        is_builtin INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE terminal_sessions (
        id                TEXT PRIMARY KEY,
        project_id        TEXT,
        provider_id       TEXT,
        kind              TEXT NOT NULL DEFAULT 'shell',
        title             TEXT,
        cwd               TEXT,
        layout_node_id    TEXT,
        created_at        INTEGER NOT NULL,
        last_active_at    INTEGER,
        serialized_buffer TEXT
      );

      CREATE TABLE layouts (
        id          TEXT PRIMARY KEY,
        project_id  TEXT,
        mosaic_json TEXT
      );

      CREATE TABLE window_state (
        id                     INTEGER PRIMARY KEY CHECK (id = 1),
        bounds_json            TEXT,
        last_active_project_id TEXT
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  },
  // v2 — Trello-style board (ideas / features / bugs) per project
  (db) => {
    db.exec(`
      CREATE TABLE board_columns (
        id           TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        title        TEXT NOT NULL,
        position     REAL NOT NULL,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_board_columns_project ON board_columns(project_path);

      CREATE TABLE board_cards (
        id           TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        column_id    TEXT NOT NULL,
        title        TEXT NOT NULL,
        body         TEXT,
        type         TEXT NOT NULL DEFAULT 'idea',
        position     REAL NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_board_cards_project ON board_cards(project_path);
      CREATE INDEX idx_board_cards_column ON board_cards(column_id);
    `)
  }
]

export function runMigrations(db: DatabaseType.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    const migrate = MIGRATIONS[v]!
    const tx = db.transaction(() => {
      migrate(db)
      db.pragma(`user_version = ${v + 1}`)
    })
    tx()
  }
}
