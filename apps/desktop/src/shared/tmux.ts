// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Pure helpers for the durable-session (tmux) layer. No node/electron imports so this is
// safe to import from the renderer, main, core and pty-host alike.

/** Private tmux socket name (`tmux -L <socket>`) — isolates our sessions from the user's own. */
export const TMUX_SOCKET = 'cmdrzone'

/**
 * Map a terminal id to its durable tmux session name. tmux session names may not contain
 * `.` or `:`; our ids already avoid those, but we sanitise defensively and prefix `cz_` so
 * our sessions are easy to recognise (and never collide with the user's). Deterministic, so
 * main/pty/renderer all derive the same name from the same id.
 */
export function tmuxSessionName(id: string): string {
  return 'cz_' + id.replace(/[^A-Za-z0-9_-]/g, '_')
}

export interface DurableStatus {
  /** tmux binary is installed and on PATH */
  available: boolean
  /** durability is switched on (and available) */
  enabled: boolean
}
