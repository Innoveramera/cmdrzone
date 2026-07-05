// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Aggregates token usage/cost from the JSONL transcripts Claude Code writes under
// ~/.claude/projects/<encoded-project-dir>/<session>.jsonl. Every assistant line carries
// `message.usage` (input/output/cache tokens), the model id, a timestamp and the `cwd`.
//
// Two transcript quirks this must handle:
//  - The SAME API message appears on several lines (one per content block), each repeating
//    the full usage — and `--resume`/forking copies history into new session files. So
//    entries are deduplicated globally by message id + request id before aggregating.
//  - `<synthetic>` lines are Claude-Code-generated notices, not billed API calls — skipped.

import { createReadStream, promises as fsp } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import os from 'node:os'
import type { UsageRow, UsageSnapshot } from '@shared/usage'

/** USD per million tokens. Cache derives from input: read 0.1×, write 1.25× (5m) / 2× (1h). */
interface ModelPrice {
  in: number
  out: number
}

// Longest/most specific prefix first — matched with startsWith, first hit wins.
const PRICES: [prefix: string, price: ModelPrice][] = [
  ['claude-fable-5', { in: 10, out: 50 }],
  ['claude-mythos', { in: 10, out: 50 }],
  ['claude-opus-4-5', { in: 5, out: 25 }],
  ['claude-opus-4-6', { in: 5, out: 25 }],
  ['claude-opus-4-7', { in: 5, out: 25 }],
  ['claude-opus-4-8', { in: 5, out: 25 }],
  ['claude-opus', { in: 15, out: 75 }], // Opus 4.1 and older
  ['claude-3-opus', { in: 15, out: 75 }],
  ['claude-sonnet', { in: 3, out: 15 }],
  ['claude-3-7-sonnet', { in: 3, out: 15 }],
  ['claude-3-5-sonnet', { in: 3, out: 15 }],
  ['claude-haiku-4-5', { in: 1, out: 5 }],
  ['claude-3-5-haiku', { in: 0.8, out: 4 }],
  ['claude-3-haiku', { in: 0.25, out: 1.25 }]
]

// Unknown (future) models: assume current Opus-tier list pricing rather than pricing at $0,
// which would silently understate spend the day a new model ships.
const DEFAULT_PRICE: ModelPrice = { in: 5, out: 25 }

function priceFor(model: string): ModelPrice {
  for (const [prefix, price] of PRICES) if (model.startsWith(prefix)) return price
  return DEFAULT_PRICE
}

/** One deduplicatable assistant message parsed from a transcript line. */
interface Entry {
  /** global dedup key: message id + request id (unique per line when the id is missing) */
  key: string
  day: string
  model: string
  cwd: string
  sessionId: string
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

interface TranscriptLine {
  type?: string
  uuid?: string
  requestId?: string
  timestamp?: string
  cwd?: string
  sessionId?: string
  message?: {
    id?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
      cache_creation?: {
        ephemeral_5m_input_tokens?: number
        ephemeral_1h_input_tokens?: number
      }
    }
  }
}

interface FileCache {
  mtimeMs: number
  size: number
  entries: Entry[]
}

// Per-file parse cache keyed by absolute path — only new/changed files are re-read, so the
// first scan pays the full cost (hundreds of MB of JSONL) and later scans are near-instant.
const fileCache = new Map<string, FileCache>()

function localDay(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

async function parseFile(path: string): Promise<Entry[]> {
  const entries: Entry[] = []
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of rl) {
    // Cheap pre-filter: only assistant lines carry usage, and most transcript bytes are
    // user/tool-result lines that a substring check rejects without a JSON.parse.
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue
    let d: TranscriptLine
    try {
      d = JSON.parse(line) as TranscriptLine
    } catch {
      continue
    }
    if (d.type !== 'assistant') continue
    const msg = d.message
    const u = msg?.usage
    if (!msg || !u) continue
    const model = msg.model ?? ''
    if (!model || model === '<synthetic>') continue
    const ts = Date.parse(d.timestamp ?? '')
    if (!Number.isFinite(ts)) continue
    const cc = u.cache_creation
    entries.push({
      key: msg.id ? `${msg.id}:${d.requestId ?? ''}` : `${path}:${d.uuid ?? entries.length}`,
      day: localDay(ts),
      model,
      cwd: d.cwd ?? '',
      sessionId: d.sessionId ?? '',
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      // Older transcripts lack the 5m/1h split — treat the lump sum as 5m (1.25×) writes.
      cacheWrite5m: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0),
      cacheWrite1h: cc?.ephemeral_1h_input_tokens ?? 0
    })
  }
  return entries
}

interface Acc {
  input: number
  output: number
  cacheRead: number
  w5m: number
  w1h: number
  messages: number
  sessions: Set<string>
}

const SEP = '\u0000' // never occurs in paths, days or model ids

export async function scanUsage(): Promise<UsageSnapshot> {
  const root = join(os.homedir(), '.claude', 'projects')
  const files: string[] = []
  try {
    for (const dirent of await fsp.readdir(root, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue
      const dir = join(root, dirent.name)
      try {
        for (const f of await fsp.readdir(dir)) {
          if (f.endsWith('.jsonl')) files.push(join(dir, f))
        }
      } catch {
        /* unreadable project dir — skip */
      }
    }
  } catch {
    return { rows: [], fileCount: 0, scannedAt: Date.now() }
  }

  // Refresh the cache: parse new/changed files, drop entries for deleted ones.
  const live = new Set(files)
  for (const p of fileCache.keys()) if (!live.has(p)) fileCache.delete(p)
  for (const p of files) {
    try {
      const st = await fsp.stat(p)
      const c = fileCache.get(p)
      if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) continue
      fileCache.set(p, { mtimeMs: st.mtimeMs, size: st.size, entries: await parseFile(p) })
    } catch {
      fileCache.delete(p)
    }
  }

  // Aggregate into (project, day, model) buckets, deduplicating messages across ALL files.
  const seenMsg = new Set<string>()
  const acc = new Map<string, Acc>()
  for (const fc of fileCache.values()) {
    for (const e of fc.entries) {
      if (seenMsg.has(e.key)) continue
      seenMsg.add(e.key)
      const k = e.cwd + SEP + e.day + SEP + e.model
      let a = acc.get(k)
      if (!a) {
        a = { input: 0, output: 0, cacheRead: 0, w5m: 0, w1h: 0, messages: 0, sessions: new Set() }
        acc.set(k, a)
      }
      a.input += e.input
      a.output += e.output
      a.cacheRead += e.cacheRead
      a.w5m += e.cacheWrite5m
      a.w1h += e.cacheWrite1h
      a.messages += 1
      if (e.sessionId) a.sessions.add(e.sessionId)
    }
  }

  const rows: UsageRow[] = []
  for (const [k, a] of acc) {
    const [projectPath, day, model] = k.split(SEP) as [string, string, string]
    const p = priceFor(model)
    const costUsd =
      (a.input * p.in +
        a.output * p.out +
        a.cacheRead * p.in * 0.1 +
        a.w5m * p.in * 1.25 +
        a.w1h * p.in * 2) /
      1e6
    rows.push({
      projectPath,
      day,
      model,
      inputTokens: a.input,
      outputTokens: a.output,
      cacheReadTokens: a.cacheRead,
      cacheWriteTokens: a.w5m + a.w1h,
      costUsd,
      messages: a.messages,
      sessions: a.sessions.size
    })
  }
  return { rows, fileCount: files.length, scannedAt: Date.now() }
}
