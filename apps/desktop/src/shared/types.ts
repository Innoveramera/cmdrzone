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
  /** per-project Figma file/proto URL (project override; empty/undefined = not connected) */
  figmaUrl?: string
  /** set on worktree child nodes: absolute path of the main repo this is a worktree of */
  worktreeOf?: string
  /** git branch checked out in this worktree (worktree nodes only) */
  branch?: string
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

export interface CardAttachment {
  id: string
  cardId: string
  projectPath: string
  /** original filename, shown on hover / used to derive the on-disk extension */
  name: string
  mime: string
  /** absolute path on disk (under <userData>/attachments/<cardId>/) */
  path: string
  /** czfile:// URL for <img src> in the sandboxed renderer (served by the main process) */
  url: string
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
  /** due date as ms at LOCAL midnight; null/undefined = no deadline */
  dueAt?: number | null
  /** 1 = starred as priority (sorts first in home "Up next"), 0/undefined = normal */
  priority?: number
  /** image attachments, loaded by getBoard (not persisted via saveCard) */
  attachments?: CardAttachment[]
}

/** payload the renderer sends to attach an image to a card (bytes read from a File) */
export interface AddAttachmentInput {
  cardId: string
  projectPath: string
  name: string
  mime: string
  bytes: Uint8Array
}

export interface BoardData {
  columns: BoardColumn[]
  cards: BoardCard[]
}

/** A board card aggregated across ALL projects for the home dashboard's "Up next" panel. */
export interface UpNextCard extends BoardCard {
  /** title of the column the card sits in (e.g. "To Do", "In Progress") */
  columnTitle: string
}

export interface RenameResult {
  ok: boolean
  newPath?: string
  error?: string
}

/** Result of creating a new project folder under the scan root. */
export interface CreateProjectResult {
  ok: boolean
  /** absolute path of the created project folder */
  path?: string
  error?: string
}

/** Result of a git-worktree operation (add / remove / merge). */
export interface WorktreeOpResult {
  ok: boolean
  /** absolute path of the created worktree (add) */
  path?: string
  /** branch created for / checked out in the worktree (add) */
  branch?: string
  error?: string
}

/**
 * A Claude Code hook event forwarded to the renderer. Emitted by the local hook server when a
 * session launched by CmdrZone reports lifecycle events (SessionStart / UserPromptSubmit /
 * PreToolUse / PermissionRequest / Stop / SessionEnd) — the authoritative agent-status source.
 */
export interface AgentHookEvent {
  /** CmdrZone terminal-tab id (from CMDRZONE_SESSION_ID in the session's env) */
  terminalId: string
  /** raw hook_event_name, e.g. 'Stop' */
  event: string
  toolName?: string
  message?: string
  /** Claude Code's own session uuid — enables future `claude --resume <id>` */
  claudeSessionId?: string
  transcriptPath?: string
  cwd?: string
  /** SessionStart source: startup | resume | clear | compact */
  source?: string
}
