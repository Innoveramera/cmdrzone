// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Minimal "Keep a Changelog" parser: splits CHANGELOG.md into per-version entries.
// Each `## ...` heading starts a new entry; everything before the first one (the `# Changelog`
// title + intro) is ignored. Headings may look like `## [0.1.0] - 2026-06-18`, `## 0.1.0`,
// or `## [Unreleased]`.

import type { ChangelogEntry } from '@shared/update'

export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let cur: { version: string; date: string | null; body: string[] } | null = null

  const flush = (): void => {
    if (cur) entries.push({ version: cur.version, date: cur.date, body: cur.body.join('\n').trim() })
  }

  for (const line of md.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      flush()
      // "[0.1.0] - 2026-06-18" | "0.1.0 - 2026-06-18" | "[Unreleased]" | "0.1.0"
      const m = /^\[?([^\]]+?)\]?(?:\s*[-–—]\s*(.+))?$/.exec(heading[1]!)
      cur = { version: (m?.[1] ?? heading[1]!).trim(), date: m?.[2]?.trim() ?? null, body: [] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  flush()
  return entries
}
