// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { create } from 'zustand'
import type { ProjectNode, AgentProviderInfo, GitStatus } from '@shared/types'
import { tmuxSessionName, type DurableStatus } from '@shared/tmux'
import type { UpdateState, ChangelogEntry } from '@shared/update'

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'
export type TerminalKind = 'agent' | 'shell' | 'devserver'
export type SplitDir = 'row' | 'col'

export interface TerminalTab {
  id: string
  projectId: string
  title: string
  kind: TerminalKind
  providerId?: string
  color: string
  cwd: string
  initialCommand?: string
  status: AgentStatus
  lastLine: string
  exited: boolean
  /** detected dev-server port (from terminal output) */
  port?: number
  /** if set, the terminal spawns this process directly instead of shell + inject */
  spawn?: { command: string; args: string[] }
}

/** A tab in the deck = a group of one or more terminal panes, split row/col. */
export interface PaneGroup {
  id: string
  projectId: string
  paneIds: string[]
  dir: SplitDir
  activePaneId: string
}

/** Durable subset of a tab we persist — enough to rebuild it and reattach its tmux session.
 * Deliberately excludes initialCommand/spawn (re-running them would re-seed a live agent) and
 * runtime fields (status/lastLine/exited/port). */
type SavedTab = Pick<
  TerminalTab,
  'id' | 'projectId' | 'title' | 'kind' | 'providerId' | 'color' | 'cwd'
>

interface WorkspaceSnapshot {
  v: 1
  terminals: Record<string, SavedTab>
  groups: Record<string, PaneGroup>
  groupOrder: string[]
  activeGroupByProject: Record<string, string>
}

let seq = 0
const uid = (p: string) => `${p}-${++seq}-${Date.now()}`

function flatten(nodes: ProjectNode[]): ProjectNode[] {
  const out: ProjectNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.children) out.push(...n.children)
  }
  return out
}

interface NewTermOpts {
  kind: TerminalKind
  providerId?: string
  initialCommand?: string
  title?: string
  cwd?: string
  spawn?: { command: string; args: string[] }
}

interface Store {
  loading: boolean
  rootPath: string
  projects: ProjectNode[]
  flat: ProjectNode[]
  agents: AgentProviderInfo[]
  gitByPath: Record<string, GitStatus>
  selectedProjectId: string | null
  terminals: Record<string, TerminalTab>
  groups: Record<string, PaneGroup>
  groupOrder: string[]
  activeGroupByProject: Record<string, string>
  paletteOpen: boolean
  /** right-hand project panel hidden (auto-hidden by default) */
  infoCollapsed: boolean
  /** left project-tree sidebar fully collapsed */
  sidebarCollapsed: boolean
  /** left sidebar width in px (resizable, persisted) */
  sidebarWidth: number
  detailMode: 'terminals' | 'editor' | 'board'
  /** durable-session (tmux) status; null until probed */
  durable: DurableStatus | null
  /** gate: don't persist the workspace until a restore attempt has run (else we'd wipe it) */
  workspaceReady: boolean
  /** running app version (empty until probed) */
  appVersion: string
  /** in-app updater state */
  update: UpdateState
  /** parsed CHANGELOG.md entries, newest first */
  changelog: ChangelogEntry[]
  /** whether the "What's New" dialog is open */
  whatsNewOpen: boolean

  refresh: () => Promise<void>
  /** probe tmux + reattach any background sessions that are still alive */
  restoreWorkspace: () => Promise<void>
  toggleDurable: () => Promise<void>
  pickRoot: () => Promise<void>
  findProject: (id: string | null) => ProjectNode | undefined
  selectProject: (id: string) => void
  clearSelection: () => void
  togglePalette: (open?: boolean) => void
  toggleInfo: () => void
  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  /** load persisted layout (sidebar width/collapse, info panel) on boot */
  initLayout: () => Promise<void>
  setDetailMode: (m: 'terminals' | 'editor' | 'board') => void
  newTerminal: (projectId: string, opts: NewTermOpts) => string
  splitActive: (projectId: string, dir: SplitDir, opts: NewTermOpts) => string
  closeTerminal: (id: string) => void
  setActiveGroup: (projectId: string, groupId: string) => void
  setActivePane: (groupId: string, paneId: string) => void
  focusTerminal: (projectId: string, terminalId: string) => void
  patchTerminal: (id: string, patch: Partial<TerminalTab>) => void
  togglePin: (node: ProjectNode) => Promise<void>
  renameProject: (oldPath: string, newName: string) => Promise<void>
  loadGit: (path: string) => Promise<void>
  /** probe version + changelog + updater state, subscribe to changes, show What's New once per version */
  initUpdates: () => Promise<void>
  checkForUpdates: () => Promise<void>
  installUpdate: () => void
  openWhatsNew: () => void
  closeWhatsNew: () => void
}

function makeTab(projectId: string, opts: NewTermOpts, project?: ProjectNode): TerminalTab {
  return {
    id: uid('term'),
    projectId,
    title: opts.title ?? (opts.kind === 'agent' ? 'Claude' : opts.kind === 'devserver' ? 'run' : 'shell'),
    kind: opts.kind,
    providerId: opts.providerId,
    color: project?.color ?? '#61afef',
    cwd: opts.cwd ?? project?.path ?? '',
    initialCommand: opts.initialCommand,
    spawn: opts.spawn,
    status: opts.kind === 'agent' ? 'working' : 'idle',
    lastLine: '',
    exited: false
  }
}

export const useStore = create<Store>((set, get) => ({
  loading: true,
  rootPath: '',
  projects: [],
  flat: [],
  agents: [],
  gitByPath: {},
  selectedProjectId: null,
  terminals: {},
  groups: {},
  groupOrder: [],
  activeGroupByProject: {},
  paletteOpen: false,
  infoCollapsed: true,
  sidebarCollapsed: false,
  sidebarWidth: 280,
  detailMode: 'terminals',
  durable: null,
  workspaceReady: false,
  appVersion: '',
  update: { status: 'idle', canAutoInstall: false },
  changelog: [],
  whatsNewOpen: false,

  refresh: async () => {
    const [projects, agents, roots] = await Promise.all([
      window.api.projects.scan(),
      window.api.agents.list(),
      window.api.settings.getRoots()
    ])
    const flat = flatten(projects)
    set({ projects, flat, agents, rootPath: roots[0] ?? '', loading: false })
    if (!get().selectedProjectId) {
      const last = await window.api.settings.get('lastSelected')
      if (last && flat.some((p) => p.id === last)) set({ selectedProjectId: last })
    }
    for (const n of flat) {
      if (n.kind === 'project') void get().loadGit(n.path)
    }
  },

  restoreWorkspace: async () => {
    const status = await window.api.durable.status()
    set({ durable: status })
    // Not durable → nothing to reattach; flip the gate so future changes persist nothing.
    if (!status.enabled) {
      set({ workspaceReady: true })
      return
    }
    const [raw, liveNames] = await Promise.all([
      window.api.settings.get('workspace'),
      window.api.durable.list()
    ])
    const live = new Set(liveNames)
    let snap: WorkspaceSnapshot | null = null
    try {
      snap = raw ? (JSON.parse(raw) as WorkspaceSnapshot) : null
    } catch {
      snap = null
    }
    if (!snap || snap.v !== 1) {
      set({ workspaceReady: true })
      return
    }

    // Keep only terminals whose background tmux session is still alive; rehydrate runtime fields.
    const terminals: Record<string, TerminalTab> = {}
    for (const id in snap.terminals) {
      if (!live.has(tmuxSessionName(id))) continue
      const t = snap.terminals[id]!
      terminals[id] = { ...t, status: t.kind === 'agent' ? 'working' : 'idle', lastLine: '', exited: false }
    }
    // Rebuild groups, dropping references to pruned terminals and any group left empty.
    const groups: Record<string, PaneGroup> = {}
    const groupOrder: string[] = []
    for (const gid of snap.groupOrder) {
      const g = snap.groups[gid]
      if (!g) continue
      const paneIds = g.paneIds.filter((p) => terminals[p])
      if (!paneIds.length) continue
      const activePaneId = paneIds.includes(g.activePaneId) ? g.activePaneId : paneIds[paneIds.length - 1]!
      groups[gid] = { ...g, paneIds, activePaneId }
      groupOrder.push(gid)
    }
    const activeGroupByProject: Record<string, string> = {}
    for (const pid in snap.activeGroupByProject) {
      const gid = snap.activeGroupByProject[pid]!
      if (groups[gid]) activeGroupByProject[pid] = gid
    }
    // Any restored project that lost its active group falls back to its first surviving group.
    for (const gid of groupOrder) {
      const g = groups[gid]!
      if (!activeGroupByProject[g.projectId]) activeGroupByProject[g.projectId] = gid
    }

    set({ terminals, groups, groupOrder, activeGroupByProject, workspaceReady: true })
  },

  toggleDurable: async () => {
    const cur = get().durable
    const next = await window.api.durable.setEnabled(!cur?.enabled)
    set({ durable: next })
  },

  pickRoot: async () => {
    const roots = await window.api.settings.pickRoot()
    if (!roots) return
    set({ rootPath: roots[0] ?? '', selectedProjectId: null })
    await get().refresh()
  },

  findProject: (id) => (id ? get().flat.find((p) => p.id === id) : undefined),

  selectProject: (id) => {
    set({ selectedProjectId: id, paletteOpen: false })
    void window.api.projects.setPref(id, 'lastOpenedAt', String(Date.now()))
    void window.api.settings.set('lastSelected', id)
  },

  clearSelection: () => set({ selectedProjectId: null }),

  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),

  toggleInfo: () => {
    set((s) => ({ infoCollapsed: !s.infoCollapsed }))
    saveLayout(get())
  },

  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
    saveLayout(get())
  },

  setSidebarWidth: (w) => {
    set({ sidebarWidth: Math.round(w) })
    saveLayoutDebounced(get())
  },

  initLayout: async () => {
    const raw = await window.api.settings.get('layout')
    if (!raw) return
    try {
      const l = JSON.parse(raw) as Partial<Pick<Store, 'sidebarWidth' | 'sidebarCollapsed' | 'infoCollapsed'>>
      set({
        sidebarWidth: typeof l.sidebarWidth === 'number' ? clampSidebar(l.sidebarWidth) : 280,
        sidebarCollapsed: !!l.sidebarCollapsed,
        infoCollapsed: l.infoCollapsed === undefined ? true : !!l.infoCollapsed
      })
    } catch {
      /* ignore malformed layout */
    }
  },

  setDetailMode: (m) => set({ detailMode: m }),

  newTerminal: (projectId, opts) => {
    const project = get().flat.find((p) => p.id === projectId)
    const tab = makeTab(projectId, opts, project)
    const gid = uid('grp')
    const group: PaneGroup = { id: gid, projectId, paneIds: [tab.id], dir: 'row', activePaneId: tab.id }
    set((s) => ({
      terminals: { ...s.terminals, [tab.id]: tab },
      groups: { ...s.groups, [gid]: group },
      groupOrder: [...s.groupOrder, gid],
      activeGroupByProject: { ...s.activeGroupByProject, [projectId]: gid }
    }))
    return tab.id
  },

  splitActive: (projectId, dir, opts) => {
    const activeGid = get().activeGroupByProject[projectId]
    const group = activeGid ? get().groups[activeGid] : undefined
    if (!group) return get().newTerminal(projectId, opts)
    const gid = group.id
    const project = get().flat.find((p) => p.id === projectId)
    const tab = makeTab(projectId, opts, project)
    set((s) => {
      const g = s.groups[gid]!
      return {
        terminals: { ...s.terminals, [tab.id]: tab },
        groups: {
          ...s.groups,
          [gid]: { ...g, paneIds: [...g.paneIds, tab.id], dir, activePaneId: tab.id }
        }
      }
    })
    return tab.id
  },

  closeTerminal: (id) => {
    // Closing a tab is intent to end it for good — destroy the durable session, don't just detach.
    window.api.pty.kill(id)
    set((s) => {
      const tab = s.terminals[id]
      const terminals = { ...s.terminals }
      delete terminals[id]
      const groups = { ...s.groups }
      let groupOrder = [...s.groupOrder]
      const activeGroupByProject = { ...s.activeGroupByProject }

      const gid = Object.keys(groups).find((g) => groups[g]!.paneIds.includes(id))
      if (gid) {
        const g = groups[gid]!
        const paneIds = g.paneIds.filter((p) => p !== id)
        if (paneIds.length === 0) {
          delete groups[gid]
          groupOrder = groupOrder.filter((x) => x !== gid)
          if (tab && activeGroupByProject[tab.projectId] === gid) {
            const sibling = groupOrder.find((x) => groups[x]?.projectId === tab.projectId)
            if (sibling) activeGroupByProject[tab.projectId] = sibling
            else delete activeGroupByProject[tab.projectId]
          }
        } else {
          const activePaneId = g.activePaneId === id ? paneIds[paneIds.length - 1]! : g.activePaneId
          groups[gid] = { ...g, paneIds, activePaneId }
        }
      }
      return { terminals, groups, groupOrder, activeGroupByProject }
    })
  },

  setActiveGroup: (projectId, groupId) =>
    set((s) => ({ activeGroupByProject: { ...s.activeGroupByProject, [projectId]: groupId } })),

  setActivePane: (groupId, paneId) =>
    set((s) => {
      const g = s.groups[groupId]
      if (!g) return s
      return {
        groups: { ...s.groups, [groupId]: { ...g, activePaneId: paneId } },
        activeGroupByProject: { ...s.activeGroupByProject, [g.projectId]: groupId }
      }
    }),

  focusTerminal: (projectId, terminalId) =>
    set((s) => {
      const gid = Object.keys(s.groups).find((g) => s.groups[g]!.paneIds.includes(terminalId))
      if (!gid) return s
      const g = s.groups[gid]!
      return {
        activeGroupByProject: { ...s.activeGroupByProject, [projectId]: gid },
        groups: { ...s.groups, [gid]: { ...g, activePaneId: terminalId } }
      }
    }),

  patchTerminal: (id, patch) =>
    set((s) => {
      const cur = s.terminals[id]
      if (!cur) return s
      return { terminals: { ...s.terminals, [id]: { ...cur, ...patch } } }
    }),

  togglePin: async (node) => {
    await window.api.projects.setPref(node.path, 'pinned', node.isPinned ? '0' : '1')
    await get().refresh()
  },

  renameProject: async (oldPath, newName) => {
    const res = await window.api.projects.rename(oldPath, newName)
    if (!res.ok || !res.newPath) return
    const newPath = res.newPath
    // re-key in-memory references (project id == path) so open sessions stay attached
    set((s) => {
      const terminals: Record<string, TerminalTab> = {}
      for (const id in s.terminals) {
        const t = s.terminals[id]!
        terminals[id] =
          t.projectId === oldPath
            ? {
                ...t,
                projectId: newPath,
                cwd: t.cwd.startsWith(oldPath) ? newPath + t.cwd.slice(oldPath.length) : t.cwd
              }
            : t
      }
      const groups: Record<string, PaneGroup> = {}
      for (const gid in s.groups) {
        const g = s.groups[gid]!
        groups[gid] = g.projectId === oldPath ? { ...g, projectId: newPath } : g
      }
      const activeGroupByProject = { ...s.activeGroupByProject }
      if (activeGroupByProject[oldPath]) {
        activeGroupByProject[newPath] = activeGroupByProject[oldPath]!
        delete activeGroupByProject[oldPath]
      }
      const selectedProjectId = s.selectedProjectId === oldPath ? newPath : s.selectedProjectId
      return { terminals, groups, activeGroupByProject, selectedProjectId }
    })
    await get().refresh()
  },

  loadGit: async (path) => {
    const git = await window.api.projects.git(path)
    set((s) => ({ gitByPath: { ...s.gitByPath, [path]: git } }))
  },

  initUpdates: async () => {
    const [version, changelog, update] = await Promise.all([
      window.api.app.version(),
      window.api.changelog.get(),
      window.api.update.getState()
    ])
    set({ appVersion: version, changelog, update })
    // Live updater state (checking → downloading → downloaded / available / error).
    window.api.update.onState((s) => set({ update: s }))
    // Show "What's New" the first time a build runs (version changed since last seen).
    const lastSeen = await window.api.settings.get('lastSeenVersion')
    if (version && version !== lastSeen && changelog.length > 0) set({ whatsNewOpen: true })
    if (version) void window.api.settings.set('lastSeenVersion', version)
  },

  checkForUpdates: async () => {
    const update = await window.api.update.check()
    set({ update })
  },

  installUpdate: () => window.api.update.install(),

  openWhatsNew: () => set({ whatsNewOpen: true }),

  closeWhatsNew: () => set({ whatsNewOpen: false })
}))

export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 520
const clampSidebar = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w))

// Layout (sidebar width/collapse + info panel) persists to its own settings key, separate from the
// durable-session workspace snapshot. Width is debounced since it changes rapidly while dragging.
function saveLayout(s: Store) {
  void window.api.settings.set(
    'layout',
    JSON.stringify({
      sidebarWidth: s.sidebarWidth,
      sidebarCollapsed: s.sidebarCollapsed,
      infoCollapsed: s.infoCollapsed
    })
  )
}
let layoutTimer: ReturnType<typeof setTimeout> | null = null
function saveLayoutDebounced(s: Store) {
  if (layoutTimer) clearTimeout(layoutTimer)
  layoutTimer = setTimeout(() => saveLayout(s), 300)
}

function serializeWorkspace(s: Store): WorkspaceSnapshot {
  const terminals: Record<string, SavedTab> = {}
  for (const id in s.terminals) {
    const t = s.terminals[id]!
    terminals[id] = {
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      kind: t.kind,
      providerId: t.providerId,
      color: t.color,
      cwd: t.cwd
    }
  }
  return { v: 1, terminals, groups: s.groups, groupOrder: s.groupOrder, activeGroupByProject: s.activeGroupByProject }
}

// Persist the workspace layout (debounced) whenever it changes — but only once a restore has run
// (so we never clobber the saved snapshot on boot) and only when durability is on (otherwise the
// restored sessions would be dead). The diff guard avoids redundant writes from unrelated changes.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSaved = ''
useStore.subscribe((s) => {
  if (!s.workspaceReady || !s.durable?.enabled) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const json = JSON.stringify(serializeWorkspace(useStore.getState()))
    if (json === lastSaved) return
    lastSaved = json
    void window.api.settings.set('workspace', json)
  }, 400)
})

/** the active pane (terminal id) of a project's active group */
export function activePaneId(s: Store, projectId: string): string | undefined {
  const gid = s.activeGroupByProject[projectId]
  return gid ? s.groups[gid]?.activePaneId : undefined
}

/** projectIds whose detail panes must stay mounted (have terminals) ∪ selected. */
export function liveWorkspaceIds(s: Store): string[] {
  const ids = new Set<string>()
  for (const id in s.terminals) ids.add(s.terminals[id]!.projectId)
  if (s.selectedProjectId) ids.add(s.selectedProjectId)
  return [...ids]
}
