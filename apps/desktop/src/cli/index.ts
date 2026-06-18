// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// `cmdrzone` CLI — lets agents (and humans) manage project boards from the shell. Runs under
// ELECTRON_RUN_AS_NODE so it reuses the Electron-ABI better-sqlite3 (see bin/cmdrzone.mjs). Talks
// straight to cmdrzone.db via the shared command core; no running app required.

import { initDatabase, closeDatabase } from '@core/persistence/database'
import { requireDbPath, type Instance } from '@core/persistence/db-path'
import * as cmd from '@core/board/commands'
import type { BoardColumn, BoardCard } from '@shared/types'

interface Parsed {
  positionals: string[]
  flags: Record<string, string | boolean>
}

const BOOL_FLAGS = new Set(['dev', 'json', 'help'])

function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '-h') {
      flags.help = true
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
        continue
      }
      const key = a.slice(2)
      const next = argv[i + 1]
      if (BOOL_FLAGS.has(key) || next == null || next.startsWith('--')) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      positionals.push(a)
    }
  }
  return { positionals, flags }
}

function str(flags: Parsed['flags'], key: string): string | undefined {
  const v = flags[key]
  return typeof v === 'string' ? v : undefined
}

function requireFlag(flags: Parsed['flags'], key: string): string {
  const v = str(flags, key)
  if (v == null || v === '') throw new Error(`--${key} is required`)
  return v
}

const HELP = `cmdrzone — manage CmdrZone project boards from the CLI

Usage:
  cmdrzone projects list
  cmdrzone board show     --project <name|path>
  cmdrzone card add        --project <p> --column <name|id> --title <t> [--body <b>] [--type idea|feature|bug|task]
  cmdrzone card update     --id <cardId> [--title <t>] [--body <b>] [--type <t>]
  cmdrzone card move       --id <cardId> [--column <name|id>] [--position <n>]
  cmdrzone card rm         --id <cardId>
  cmdrzone column add      --project <p> --title <t>
  cmdrzone column rename   --project <p> --column <name|id> --title <t>
  cmdrzone column rm       --project <p> --column <name|id>

Global flags:
  --db <path>     explicit cmdrzone.db path        (or $CMDRZONE_DB)
  --dev           target the "CmdrZone Dev" instance (or $CMDRZONE_INSTANCE=dev)
  --json          machine-readable JSON output
  -h, --help      show this help
`

function emit(json: boolean, human: string, data: unknown): void {
  console.log(json ? JSON.stringify(data, null, 2) : human)
}

function colLine(c: BoardColumn): string {
  return `  [${c.id}] ${c.title}`
}
function cardLine(c: BoardCard): string {
  return `    • (${c.type}) ${c.title}  [${c.id}]`
}

function run(parsed: Parsed): void {
  const { positionals, flags } = parsed
  const json = !!flags.json
  const [group, action] = positionals

  if (flags.help || !group) {
    console.log(HELP)
    return
  }

  const opts = {
    db: str(flags, 'db'),
    instance: (flags.dev ? 'dev' : (str(flags, 'instance') as Instance | undefined)) as
      | Instance
      | undefined
  }
  initDatabase(requireDbPath(opts))

  if (group === 'projects' && (action === 'list' || action == null)) {
    const projects = cmd.listProjects()
    const human = projects.map((p) => `${p.name}\t${p.type}\t${p.path}`).join('\n')
    return emit(json, human || '(no projects found)', projects)
  }

  if (group === 'board' && action === 'show') {
    const board = cmd.getBoardFor(requireFlag(flags, 'project'))
    const human = [
      board.projectPath,
      ...board.columns.map(
        (c) =>
          colLine(c) +
          '\n' +
          board.cards
            .filter((card) => card.columnId === c.id)
            .sort((a, b) => a.position - b.position)
            .map(cardLine)
            .join('\n')
      )
    ].join('\n')
    return emit(json, human, board)
  }

  if (group === 'card') {
    if (action === 'add') {
      const card = cmd.addCard({
        project: requireFlag(flags, 'project'),
        column: requireFlag(flags, 'column'),
        title: requireFlag(flags, 'title'),
        body: str(flags, 'body'),
        type: str(flags, 'type')
      })
      return emit(json, `added ${card.id} (${card.type}) "${card.title}"`, card)
    }
    if (action === 'update') {
      const card = cmd.updateCard(requireFlag(flags, 'id'), {
        title: str(flags, 'title'),
        body: str(flags, 'body'),
        type: str(flags, 'type')
      })
      return emit(json, `updated ${card.id} "${card.title}"`, card)
    }
    if (action === 'move') {
      const position = str(flags, 'position')
      const card = cmd.moveCard(requireFlag(flags, 'id'), {
        column: str(flags, 'column'),
        position: position != null ? Number(position) : undefined
      })
      return emit(json, `moved ${card.id} -> column ${card.columnId} @ ${card.position}`, card)
    }
    if (action === 'rm') {
      const res = cmd.removeCard(requireFlag(flags, 'id'))
      return emit(json, res.existed ? `removed ${res.id}` : `no card ${res.id} (nothing to do)`, res)
    }
  }

  if (group === 'column') {
    if (action === 'add') {
      const col = cmd.addColumn(requireFlag(flags, 'project'), requireFlag(flags, 'title'))
      return emit(json, `added column ${col.id} "${col.title}"`, col)
    }
    if (action === 'rename') {
      const col = cmd.renameColumn(
        requireFlag(flags, 'project'),
        requireFlag(flags, 'column'),
        requireFlag(flags, 'title')
      )
      return emit(json, `renamed column ${col.id} -> "${col.title}"`, col)
    }
    if (action === 'rm') {
      const res = cmd.removeColumn(requireFlag(flags, 'project'), requireFlag(flags, 'column'))
      return emit(json, `removed column ${res.id} "${res.title}"`, res)
    }
  }

  throw new Error(`Unknown command: ${[group, action].filter(Boolean).join(' ')}\n\n${HELP}`)
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2))
  try {
    run(parsed)
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  } finally {
    closeDatabase()
  }
}

main()
