// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The shape of `window.api` exposed by the preload via contextBridge.
import type {
  PtyCreateOptions,
  PtyDataPayload,
  PtyExitPayload
} from './ipc'
import type {
  EnvProbeResult,
  ProjectNode,
  GitStatus,
  AgentProviderInfo,
  DirEntry,
  BoardData,
  BoardCard,
  BoardColumn
} from './types'

export interface DesktopApi {
  pty: {
    create(opts: PtyCreateOptions): Promise<void>
    input(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    dispose(id: string): void
    /** subscribe to output for any terminal; returns an unsubscribe fn */
    onData(cb: (p: PtyDataPayload) => void): () => void
    onExit(cb: (p: PtyExitPayload) => void): () => void
  }
  env: {
    probe(): Promise<EnvProbeResult>
  }
  projects: {
    scan(): Promise<ProjectNode[]>
    git(path: string): Promise<GitStatus>
    setPref(path: string, key: string, value: string | null): Promise<void>
  }
  agents: {
    list(): Promise<AgentProviderInfo[]>
  }
  fs: {
    readDir(path: string): Promise<DirEntry[]>
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string): Promise<boolean>
  }
  settings: {
    getRoots(): Promise<string[]>
    /** open a folder picker; returns the new roots, or null if cancelled */
    pickRoot(): Promise<string[] | null>
    get(key: string): Promise<string>
    set(key: string, value: string): Promise<void>
  }
  shell: {
    reveal(path: string): void
    openExternal(url: string): void
  }
  board: {
    get(path: string): Promise<BoardData>
    saveCard(card: BoardCard): Promise<void>
    deleteCard(id: string): Promise<void>
    saveColumn(column: BoardColumn): Promise<void>
    deleteColumn(id: string): Promise<void>
  }
}
