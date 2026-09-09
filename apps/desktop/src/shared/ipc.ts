// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Typed IPC contract shared by main + preload + renderer.

export const IPC = {
  // renderer -> main (invoke)
  ptyCreate: 'pty:create',
  envProbe: 'env:probe',
  projectsScan: 'projects:scan',
  projectsGit: 'projects:git',
  projectSetPref: 'projects:setPref',
  projectsRename: 'projects:rename',
  /** create <root>/<name> + git init + AGENTS.md seeded with the user's idea (+ CLAUDE.md pointer) */
  projectsCreate: 'projects:create',
  agentsList: 'agents:list',
  // git worktrees (parallel agents)
  worktreeAdd: 'worktrees:add',
  worktreeRemove: 'worktrees:remove',
  worktreeMerge: 'worktrees:merge',
  fsReadDir: 'fs:readDir',
  fsReadFile: 'fs:readFile',
  fsWriteFile: 'fs:writeFile',
  settingsGetRoots: 'settings:getRoots',
  settingsPickRoot: 'settings:pickRoot',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  boardGet: 'board:get',
  /** cards in To Do / In Progress columns across ALL projects (home "Up next" panel) */
  boardUpNext: 'board:upNext',
  boardSaveCard: 'board:saveCard',
  boardDeleteCard: 'board:deleteCard',
  boardSaveColumn: 'board:saveColumn',
  boardDeleteColumn: 'board:deleteColumn',
  boardAddAttachment: 'board:addAttachment',
  boardDeleteAttachment: 'board:deleteAttachment',
  /** save dropped image bytes to a temp file, return its absolute path (terminal drop) */
  mediaSaveTemp: 'media:saveTemp',
  revealInFinder: 'shell:reveal',
  openExternal: 'shell:openExternal',
  clipboardRead: 'clipboard:read',
  // durable sessions (tmux)
  durableStatus: 'durable:status',
  durableSetEnabled: 'durable:setEnabled',
  durableList: 'durable:list',
  /** aggregate token usage/cost from Claude Code's JSONL transcripts */
  usageScan: 'usage:scan',
  // app version + in-app updates + changelog
  appGetVersion: 'app:getVersion',
  updateCheck: 'update:check',
  updateGetState: 'update:getState',
  changelogGet: 'changelog:get',
  // renderer -> main (send, fire-and-forget)
  ptyInput: 'pty:input',
  ptyResize: 'pty:resize',
  ptyDispose: 'pty:dispose',
  /** destroy a session for good (vs dispose, which only detaches a durable one) */
  ptyKill: 'pty:kill',
  clipboardWrite: 'clipboard:write',
  /** restart and apply a staged update */
  updateInstall: 'update:install',
  // main -> renderer (events)
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  /** pushed whenever the updater's state changes */
  updateState: 'update:state',
  /** Claude Code hook event for a terminal (authoritative agent status) */
  agentHookEvent: 'agentHook:event',
  // Changes tab: checkpoints, diffs, commit → push → PR (see core/git)
  gitInfo: 'git:info',
  gitChanges: 'git:changes',
  gitFileDiff: 'git:fileDiff',
  gitCheckpoint: 'git:checkpoint',
  gitCheckpoints: 'git:checkpoints',
  gitDropCheckpoints: 'git:dropCheckpoints',
  gitPruneCheckpoints: 'git:pruneCheckpoints',
  /** restore the working tree to a checkpoint (confirms first — discards work) */
  gitRevert: 'git:revert',
  gitCommit: 'git:commit',
  gitPush: 'git:push',
  gitCreatePr: 'git:createPr',
  gitPrStatus: 'git:prStatus',
  /** draft commit message + PR text from the diff via headless `claude -p` */
  gitGenerate: 'git:generate',
  // custom themes: pick + read a VS Code / CmdrZone theme file, save an export
  themeImportFile: 'theme:importFile',
  themeExportFile: 'theme:exportFile'
} as const

export interface PtyCreateOptions {
  id: string
  cwd: string
  cols: number
  rows: number
  /** optional command injected into the interactive shell after it starts (agent launch) */
  initialCommand?: string
  /** if set, spawn this process directly (argv, no shell) instead of shell + inject */
  spawn?: { command: string; args: string[] }
  /** agent provider launching in this terminal; main wires Claude Code up to the hook server */
  providerId?: string
}

export interface PtyInputPayload {
  id: string
  data: string
}

export interface PtyResizePayload {
  id: string
  cols: number
  rows: number
}

export interface PtyDisposePayload {
  id: string
}

/** node-pty emits UTF-8 strings with internal boundary buffering, so we stream strings. */
export interface PtyDataPayload {
  id: string
  data: string
}

export interface PtyExitPayload {
  id: string
  exitCode: number
  signal?: number
}
