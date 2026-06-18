// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Shared board command core: the single place that turns high-level intents ("add a card to the
// Ideas column of project X") into the low-level upserts in ./board. Used by the CLI and the MCP
// server so agents can manage boards without the desktop UI. Pure domain logic — no electron, no
// argv, no process I/O beyond reading the project scan. Mirrors the id/position/column-resolution
// logic that ProjectBoard.tsx does inline in the renderer.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getBoard,
  getCard,
  saveCard,
  deleteCard,
  saveColumn,
  deleteColumn
} from './board'
import { scanProjects } from '@core/projects/scanner'
import { getSetting, getAllPrefs, applyPrefs } from '@core/persistence/repos'
import type { BoardCard, BoardColumn, BoardData, CardType, ProjectNode } from '@shared/types'

const CARD_TYPES: CardType[] = ['idea', 'feature', 'bug', 'task']

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function validateType(t?: string | null): CardType {
  if (t == null || t === '') return 'task'
  if ((CARD_TYPES as string[]).includes(t)) return t as CardType
  throw new Error(`Invalid card type "${t}". Use one of: ${CARD_TYPES.join(', ')}`)
}

function nextCardPosition(board: BoardData, columnId: string): number {
  const positions = board.cards.filter((c) => c.columnId === columnId).map((c) => c.position)
  return (positions.length ? Math.max(...positions) : 0) + 1
}

// ---- project discovery (mirrors scanAll() in main/index.ts) ----

function getRoots(): string[] {
  const def = JSON.stringify([path.join(os.homedir(), 'Development')])
  try {
    const arr = JSON.parse(getSetting('roots', def))
    return Array.isArray(arr) && arr.length ? arr : JSON.parse(def)
  } catch {
    return JSON.parse(def)
  }
}

function scanAll(): ProjectNode[] {
  const nodes = scanProjects(getRoots())
  applyPrefs(nodes, getAllPrefs())
  return nodes
}

/** Flatten the project tree (groups + their children) into a single list. */
function flattenProjects(nodes: ProjectNode[]): ProjectNode[] {
  const out: ProjectNode[] = []
  const walk = (n: ProjectNode): void => {
    out.push(n)
    n.children?.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

export interface ProjectSummary {
  name: string
  path: string
  type: string
  kind: string
}

export function listProjects(): ProjectSummary[] {
  return flattenProjects(scanAll()).map((p) => ({
    name: p.name,
    path: p.path,
    type: p.type,
    kind: p.kind
  }))
}

/**
 * Resolve a project reference to its absolute path. Accepts an absolute/relative directory path
 * (used as-is if it exists) or a project name matched case-insensitively against the scan.
 */
export function resolveProject(ref: string): string {
  const trimmed = ref.trim()
  if (!trimmed) throw new Error('project is required')
  const looksLikePath =
    path.isAbsolute(trimmed) || trimmed.startsWith('.') || trimmed.includes(path.sep)
  if (looksLikePath) {
    const abs = path.resolve(trimmed)
    if (isDir(abs)) return abs
  }
  const all = flattenProjects(scanAll())
  const matches = all.filter(
    (p) => p.path === trimmed || p.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (matches.length === 1) return matches[0]!.path
  if (matches.length === 0) {
    throw new Error(
      `No project matching "${ref}". Run \`projects list\` to see options, or pass an absolute path.`
    )
  }
  throw new Error(
    `Ambiguous project "${ref}" — matches:\n` +
      matches.map((m) => `  ${m.path}`).join('\n') +
      `\nPass the full path instead.`
  )
}

/** Resolve a column by id first, then case-insensitive title. */
export function resolveColumn(projectPath: string, ref: string): BoardColumn {
  const { columns } = getBoard(projectPath)
  const t = ref.trim()
  const byId = columns.find((c) => c.id === t)
  if (byId) return byId
  const byTitle = columns.find((c) => c.title.toLowerCase() === t.toLowerCase())
  if (byTitle) return byTitle
  throw new Error(
    `No column "${ref}" on this board. Available: ${columns.map((c) => c.title).join(', ') || '(none)'}`
  )
}

export function getBoardFor(project: string): BoardData & { projectPath: string } {
  const projectPath = resolveProject(project)
  return { projectPath, ...getBoard(projectPath) }
}

// ---- cards ----

export interface AddCardInput {
  project: string
  column: string
  title: string
  body?: string
  type?: string | null
}

export function addCard(input: AddCardInput): BoardCard {
  const projectPath = resolveProject(input.project)
  const col = resolveColumn(projectPath, input.column)
  const type = validateType(input.type)
  const title = input.title?.trim()
  if (!title) throw new Error('title is required')
  const board = getBoard(projectPath)
  const now = Date.now()
  const card: BoardCard = {
    id: genId('card'),
    projectPath,
    columnId: col.id,
    title,
    body: input.body ?? '',
    type,
    position: nextCardPosition(board, col.id),
    createdAt: now,
    updatedAt: now
  }
  saveCard(card)
  return card
}

export interface UpdateCardPatch {
  title?: string
  body?: string
  type?: string | null
}

export function updateCard(id: string, patch: UpdateCardPatch): BoardCard {
  const card = getCard(id)
  if (!card) throw new Error(`No card with id "${id}"`)
  let title = card.title
  if (patch.title != null) {
    const t = patch.title.trim()
    if (!t) throw new Error('title cannot be empty')
    title = t
  }
  const updated: BoardCard = {
    ...card,
    title,
    body: patch.body != null ? patch.body : card.body,
    type: patch.type != null && patch.type !== '' ? validateType(patch.type) : card.type,
    updatedAt: Date.now()
  }
  saveCard(updated)
  return updated
}

export interface MoveCardInput {
  column?: string
  position?: number
}

export function moveCard(id: string, input: MoveCardInput): BoardCard {
  const card = getCard(id)
  if (!card) throw new Error(`No card with id "${id}"`)
  let columnId = card.columnId
  if (input.column != null && input.column !== '') {
    columnId = resolveColumn(card.projectPath, input.column).id
  }
  const position =
    input.position != null ? input.position : nextCardPosition(getBoard(card.projectPath), columnId)
  const updated: BoardCard = { ...card, columnId, position, updatedAt: Date.now() }
  saveCard(updated)
  return updated
}

export function removeCard(id: string): { id: string; existed: boolean } {
  const existed = !!getCard(id)
  deleteCard(id)
  return { id, existed }
}

// ---- columns ----

export function addColumn(project: string, title: string): BoardColumn {
  const projectPath = resolveProject(project)
  const t = title?.trim()
  if (!t) throw new Error('column title is required')
  const board = getBoard(projectPath)
  const position = (board.columns.length ? Math.max(...board.columns.map((c) => c.position)) : 0) + 1
  const col: BoardColumn = {
    id: genId('col'),
    projectPath,
    title: t,
    position,
    createdAt: Date.now()
  }
  saveColumn(col)
  return col
}

export function renameColumn(project: string, columnRef: string, title: string): BoardColumn {
  const projectPath = resolveProject(project)
  const col = resolveColumn(projectPath, columnRef)
  const t = title?.trim()
  if (!t) throw new Error('new column title is required')
  const updated: BoardColumn = { ...col, title: t }
  saveColumn(updated)
  return updated
}

export function removeColumn(project: string, columnRef: string): { id: string; title: string } {
  const projectPath = resolveProject(project)
  const col = resolveColumn(projectPath, columnRef)
  deleteColumn(col.id)
  return { id: col.id, title: col.title }
}
