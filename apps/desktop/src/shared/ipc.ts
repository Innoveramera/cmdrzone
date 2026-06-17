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
  agentsList: 'agents:list',
  fsReadDir: 'fs:readDir',
  fsReadFile: 'fs:readFile',
  fsWriteFile: 'fs:writeFile',
  settingsGetRoots: 'settings:getRoots',
  settingsPickRoot: 'settings:pickRoot',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  boardGet: 'board:get',
  boardSaveCard: 'board:saveCard',
  boardDeleteCard: 'board:deleteCard',
  boardSaveColumn: 'board:saveColumn',
  boardDeleteColumn: 'board:deleteColumn',
  revealInFinder: 'shell:reveal',
  openExternal: 'shell:openExternal',
  // renderer -> main (send, fire-and-forget)
  ptyInput: 'pty:input',
  ptyResize: 'pty:resize',
  ptyDispose: 'pty:dispose',
  // main -> renderer (events)
  ptyData: 'pty:data',
  ptyExit: 'pty:exit'
} as const

export interface PtyCreateOptions {
  id: string
  cwd: string
  cols: number
  rows: number
  /** optional command injected into the interactive shell after it starts (agent launch) */
  initialCommand?: string
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
