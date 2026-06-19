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
  BoardColumn,
  CardAttachment,
  AddAttachmentInput,
  RenameResult
} from './types'
import type { DurableStatus } from './tmux'
import type { UpdateState, ChangelogEntry } from './update'

export interface DesktopApi {
  pty: {
    create(opts: PtyCreateOptions): Promise<void>
    input(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    /** detach: tears down the view; a durable (tmux) session keeps running in the background */
    dispose(id: string): void
    /** destroy for good: kills the underlying durable session (user closed the tab) */
    kill(id: string): void
    /** subscribe to output for any terminal; returns an unsubscribe fn */
    onData(cb: (p: PtyDataPayload) => void): () => void
    onExit(cb: (p: PtyExitPayload) => void): () => void
  }
  durable: {
    /** whether tmux is installed and durability is enabled */
    status(): Promise<DurableStatus>
    setEnabled(enabled: boolean): Promise<DurableStatus>
    /** names of durable sessions still alive in the background tmux server */
    list(): Promise<string[]>
  }
  env: {
    probe(): Promise<EnvProbeResult>
  }
  projects: {
    scan(): Promise<ProjectNode[]>
    git(path: string): Promise<GitStatus>
    setPref(path: string, key: string, value: string | null): Promise<void>
    /** rename the project's folder on disk (confirms first); migrates board + prefs */
    rename(path: string, newName: string): Promise<RenameResult>
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
  clipboard: {
    /** write the user's terminal selection to the system clipboard (⌘C) */
    write(text: string): void
    /** read the system clipboard to paste into a terminal (⌘V) */
    read(): Promise<string>
  }
  board: {
    get(path: string): Promise<BoardData>
    saveCard(card: BoardCard): Promise<void>
    deleteCard(id: string): Promise<void>
    saveColumn(column: BoardColumn): Promise<void>
    deleteColumn(id: string): Promise<void>
    /** attach an image (bytes from a File) to a card; resolves with the stored record */
    addAttachment(input: AddAttachmentInput): Promise<CardAttachment>
    deleteAttachment(id: string): Promise<void>
  }
  media: {
    /** absolute filesystem path of a dropped File, or '' if it has none (e.g. dragged from the web) */
    pathForFile(file: File): string
    /** persist dropped image bytes to a temp file; resolves with the absolute path */
    saveTemp(name: string, bytes: Uint8Array): Promise<string>
  }
  app: {
    /** the running app version (from package.json) */
    version(): Promise<string>
  }
  update: {
    /** trigger a check now; resolves with the resulting state */
    check(): Promise<UpdateState>
    /** current updater state (for initial render) */
    getState(): Promise<UpdateState>
    /** restart and apply a staged update (valid once status === 'downloaded') */
    install(): void
    /** subscribe to updater state changes; returns an unsubscribe fn */
    onState(cb: (s: UpdateState) => void): () => void
  }
  changelog: {
    /** parsed CHANGELOG.md entries, newest first */
    get(): Promise<ChangelogEntry[]>
  }
}
