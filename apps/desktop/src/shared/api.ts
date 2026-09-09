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
  AgentHookEvent,
  DirEntry,
  BoardData,
  BoardCard,
  BoardColumn,
  UpNextCard,
  CardAttachment,
  AddAttachmentInput,
  RenameResult,
  CreateProjectResult,
  WorktreeOpResult
} from './types'
import type { DurableStatus } from './tmux'
import type { UpdateState, ChangelogEntry } from './update'
import type { UsageSnapshot } from './usage'
import type {
  ChangeSet,
  ChangedFile,
  Checkpoint,
  CheckpointRevertResult,
  FileDiff,
  GeneratedMessages,
  GitInfo,
  GitOpResult,
  PrInfo
} from './git'

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
    /** create a new project folder under the scan root (git init + seeded AGENTS.md) */
    create(name: string, description: string): Promise<CreateProjectResult>
  }
  agents: {
    list(): Promise<AgentProviderInfo[]>
    /** subscribe to Claude Code hook events (authoritative status); returns an unsubscribe fn */
    onHookEvent(cb: (ev: AgentHookEvent) => void): () => void
  }
  worktrees: {
    /** create <parent>/.cz-worktrees/<repo>/<name> on a new cz/<name> branch */
    add(projectPath: string, name: string): Promise<WorktreeOpResult>
    /** remove a worktree + its branch (confirms first; discards unmerged work) */
    remove(projectPath: string, worktreePath: string): Promise<WorktreeOpResult>
    /** merge the worktree's branch into the main checkout, then remove it (confirms first) */
    merge(projectPath: string, worktreePath: string): Promise<WorktreeOpResult>
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
    /** cards in To Do / In Progress columns across ALL projects (home "Up next" panel) */
    upNext(): Promise<UpNextCard[]>
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
  usage: {
    /** aggregate token usage/cost per (project, day, model) from Claude Code transcripts */
    scan(): Promise<UsageSnapshot>
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
  git: {
    /** branch / upstream / remote facts + whether `gh` is ready for pull requests */
    info(repo: string): Promise<GitInfo>
    /** files changed between `base` ('HEAD' = uncommitted; or a checkpoint sha/ref) and the working tree now */
    changes(repo: string, base: string): Promise<ChangeSet>
    /** both sides of one file from a listed ChangeSet (base + its snapshot tree) */
    fileDiff(repo: string, base: string, tree: string, file: Pick<ChangedFile, 'path' | 'oldPath' | 'binary'>): Promise<FileDiff>
    /** snapshot the working tree as a hidden ref for a terminal ('start' on launch, 'turn' after each Stop) */
    checkpoint(repo: string, terminalId: string, label: 'start' | 'turn'): Promise<Checkpoint | null>
    /** every checkpoint in the repo (all terminals), oldest first */
    checkpoints(repo: string): Promise<Checkpoint[]>
    /** delete a closed tab's checkpoints */
    dropCheckpoints(repo: string, terminalId: string): void
    /** delete checkpoints whose terminal is no longer open */
    pruneCheckpoints(repo: string, liveTerminalIds: string[]): Promise<number>
    /** restore the working tree to a checkpoint (native confirm first) */
    revert(repo: string, ref: string): Promise<CheckpointRevertResult>
    /** stage (all, or `paths`) + commit; value = short sha */
    commit(repo: string, message: string, paths: string[] | null): Promise<GitOpResult>
    push(repo: string): Promise<GitOpResult>
    /** `gh pr create`; value = PR url */
    createPr(repo: string, opts: { title: string; body: string; draft: boolean; base?: string }): Promise<GitOpResult>
    /** the branch's PR on GitHub, or null */
    prStatus(repo: string, branch?: string): Promise<PrInfo | null>
    /** draft commit + PR text for the diff base→tree with headless Claude */
    generate(repo: string, base: string, tree: string): Promise<GeneratedMessages>
  }
  theme: {
    /** open a file picker for a theme JSON; resolves { name, content } or null if cancelled */
    importFile(): Promise<{ name: string; content: string } | null>
    /** save dialog for an exported theme; resolves true when written */
    exportFile(name: string, content: string): Promise<boolean>
  }
}
