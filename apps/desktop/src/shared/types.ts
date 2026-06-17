// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Framework-agnostic domain types shared between main, preload and renderer.
// NOTHING in here may import electron or node — it is pure data.

export type ProjectType = 'next' | 'node-ts' | 'mcp' | 'flutter' | 'unknown'

export type TerminalKind = 'agent' | 'shell' | 'devserver'

export type ProjectKind = 'project' | 'group' | 'docs'

export interface GitStatus {
  isRepo: boolean
  branch?: string
  dirty: number
  ahead: number
  behind: number
}

export interface ProjectNode {
  /** stable id = absolute path */
  id: string
  name: string
  path: string
  type: ProjectType
  kind: ProjectKind
  parentPath?: string
  color: string
  isPinned: boolean
  isHidden: boolean
  defaultProviderId?: string
  lastOpenedAt?: number
  hasClaudeMd: boolean
  hasTasksMd: boolean
  hasReadme: boolean
  hasEnv: boolean
  hasPackageJson: boolean
  scripts?: Record<string, string>
  children?: ProjectNode[]
  git?: GitStatus
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  /** true for dirs we don't want to expand (node_modules, .git, …) */
  heavy: boolean
}

export interface AgentProviderInfo {
  id: string
  name: string
  installed: boolean
  path: string | null
  version: string | null
  isDefault: boolean
}

export interface EnvProbeResult {
  shell: string
  home: string
  path: string
  /** binary name -> absolute path, or null if not found on the resolved PATH */
  resolved: Record<string, string | null>
}

// ---- Board (Trello-style ideas/features/bugs, per project) ----

export type CardType = 'idea' | 'feature' | 'bug' | 'task'

export interface BoardColumn {
  id: string
  projectPath: string
  title: string
  position: number
  createdAt: number
}

export interface BoardCard {
  id: string
  projectPath: string
  columnId: string
  title: string
  body: string
  type: CardType
  position: number
  createdAt: number
  updatedAt: number
}

export interface BoardData {
  columns: BoardColumn[]
  cards: BoardCard[]
}
