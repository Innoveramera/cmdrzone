import { create } from 'zustand'
import type { ProjectNode, AgentProviderInfo, GitStatus } from '@shared/types'

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'
export type TerminalKind = 'agent' | 'shell' | 'devserver'

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

let termSeq = 0

function flatten(nodes: ProjectNode[]): ProjectNode[] {
  const out: ProjectNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.children) out.push(...n.children)
  }
  return out
}

interface Store {
  loading: boolean
  rootPath: string
  projects: ProjectNode[]
  flat: ProjectNode[]
  agents: AgentProviderInfo[]
  gitByPath: Record<string, GitStatus>
  /** the selected project (master-detail). null = show the dashboard. */
  selectedProjectId: string | null
  terminals: Record<string, TerminalTab>
  order: string[]
  activeTerminalByProject: Record<string, string>
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
  newTerminal: (
    projectId: string,
    opts: { kind: TerminalKind; providerId?: string; initialCommand?: string; title?: string; cwd?: string }
  ) => string
  closeTerminal: (id: string) => void
  setActiveTerminal: (projectId: string, id: string) => void
  patchTerminal: (id: string, patch: Partial<TerminalTab>) => void
  togglePin: (node: ProjectNode) => Promise<void>
  loadGit: (path: string) => Promise<void>
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
  order: [],
  activeTerminalByProject: {},
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
    // Restore last-selected project on first load (don't override a current selection).
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
    const id = `term-${++termSeq}-${Date.now()}`
    const tab: TerminalTab = {
      id,
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
    set((s) => ({
      terminals: { ...s.terminals, [id]: tab },
      order: [...s.order, id],
      activeTerminalByProject: { ...s.activeTerminalByProject, [projectId]: id }
    }))
    return id
  },

  closeTerminal: (id) => {
    set((s) => {
      const tab = s.terminals[id]
      const terminals = { ...s.terminals }
      delete terminals[id]
      const order = s.order.filter((t) => t !== id)
      const active = { ...s.activeTerminalByProject }
      if (tab && active[tab.projectId] === id) {
        const sibling = order.find((t) => terminals[t]?.projectId === tab.projectId)
        if (sibling) active[tab.projectId] = sibling
        else delete active[tab.projectId]
      }
      return { terminals, order, activeTerminalByProject: active }
    })
  },

  setActiveTerminal: (projectId, id) =>
    set((s) => ({ activeTerminalByProject: { ...s.activeTerminalByProject, [projectId]: id } })),

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

/** projectIds whose detail panes must stay mounted (have terminals) ∪ selected. */
export function liveWorkspaceIds(s: Store): string[] {
  const ids = new Set<string>()
  for (const id in s.terminals) ids.add(s.terminals[id]!.projectId)
  if (s.selectedProjectId) ids.add(s.selectedProjectId)
  return [...ids]
}
