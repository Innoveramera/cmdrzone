// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { create } from 'zustand'
import type { ProjectNode, AgentProviderInfo, GitStatus } from '@shared/types'

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
}

/** A tab in the deck = a group of one or more terminal panes, split row/col. */
export interface PaneGroup {
  id: string
  projectId: string
  paneIds: string[]
  dir: SplitDir
  activePaneId: string
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
  infoCollapsed: boolean
  detailMode: 'terminals' | 'editor'

  refresh: () => Promise<void>
  pickRoot: () => Promise<void>
  findProject: (id: string | null) => ProjectNode | undefined
  selectProject: (id: string) => void
  clearSelection: () => void
  togglePalette: (open?: boolean) => void
  toggleInfo: () => void
  setDetailMode: (m: 'terminals' | 'editor') => void
  newTerminal: (projectId: string, opts: NewTermOpts) => string
  splitActive: (projectId: string, dir: SplitDir, opts: NewTermOpts) => string
  closeTerminal: (id: string) => void
  setActiveGroup: (projectId: string, groupId: string) => void
  setActivePane: (groupId: string, paneId: string) => void
  focusTerminal: (projectId: string, terminalId: string) => void
  patchTerminal: (id: string, patch: Partial<TerminalTab>) => void
  togglePin: (node: ProjectNode) => Promise<void>
  loadGit: (path: string) => Promise<void>
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
  infoCollapsed: false,
  detailMode: 'terminals',

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

  toggleInfo: () => set((s) => ({ infoCollapsed: !s.infoCollapsed })),

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

  loadGit: async (path) => {
    const git = await window.api.projects.git(path)
    set((s) => ({ gitByPath: { ...s.gitByPath, [path]: git } }))
  }
}))

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
