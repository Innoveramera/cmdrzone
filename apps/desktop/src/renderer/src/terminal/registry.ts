import type { Terminal as XTerm } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { useStore, type AgentStatus } from '../state/store'
import { classifyIdle, lastNonEmptyLine, stripAnsi } from './agentState'

function detectPort(buffer: string): number | null {
  const m = stripAnsi(buffer).match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/)
  if (m) {
    const n = parseInt(m[1]!, 10)
    if (n >= 80 && n <= 65535) return n
  }
  return null
}

interface Inst {
  term: XTerm
  fit: FitAddon
  lastActivity: number
  buffer: string
}

const reg = new Map<string, Inst>()
let inited = false

export function registerTerm(id: string, term: XTerm, fit: FitAddon): void {
  reg.set(id, { term, fit, lastActivity: Date.now(), buffer: '' })
}
export function unregisterTerm(id: string): void {
  reg.delete(id)
}
export function getInst(id: string): Inst | undefined {
  return reg.get(id)
}

function notify(tab: { title: string; projectId: string }, status: AgentStatus, lastLine: string): void {
  const project = useStore.getState().findProject(tab.projectId)
  const name = project?.name ?? 'project'
  try {
    if (status === 'waiting') new Notification(`⏸ ${name} — needs input`, { body: lastLine || tab.title })
    else if (status === 'done') new Notification(`✅ ${name} — agent done`, { body: tab.title })
    else if (status === 'error') new Notification(`⛔ ${name} — agent error`, { body: lastLine || tab.title })
  } catch {
    /* notifications may be unavailable */
  }
}

/** Set up the single global PTY output router + the idle-status ticker. Call once. */
export function initTerminalRouting(): void {
  if (inited) return
  inited = true

  window.api.pty.onData((p) => {
    const inst = reg.get(p.id)
    if (!inst) return
    inst.term.write(p.data)
    inst.lastActivity = Date.now()
    inst.buffer = (inst.buffer + p.data).slice(-4000)

    const tab = useStore.getState().terminals[p.id]
    if (tab && tab.kind === 'agent' && !tab.exited && tab.status !== 'working') {
      useStore.getState().patchTerminal(p.id, { status: 'working', lastLine: lastNonEmptyLine(inst.buffer) })
    }
    if (tab && !tab.port) {
      const port = detectPort(inst.buffer)
      if (port) useStore.getState().patchTerminal(p.id, { port })
    }
  })

  window.api.pty.onExit((p) => {
    const inst = reg.get(p.id)
    inst?.term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n')
    const tab = useStore.getState().terminals[p.id]
    if (!tab) return
    const status: AgentStatus = p.exitCode === 0 ? 'done' : 'error'
    useStore.getState().patchTerminal(p.id, { exited: true, status })
    if (tab.kind === 'agent') notify(tab, status, '')
  })

  setInterval(() => {
    const now = Date.now()
    const { terminals, patchTerminal } = useStore.getState()
    for (const id in terminals) {
      const tab = terminals[id]!
      if (tab.kind !== 'agent' || tab.exited) continue
      const inst = reg.get(id)
      if (!inst) continue
      if (now - inst.lastActivity > 1200) {
        const next = classifyIdle(inst.buffer)
        if (next !== tab.status) {
          const lastLine = lastNonEmptyLine(inst.buffer)
          patchTerminal(id, { status: next, lastLine })
          if (next === 'waiting' || next === 'error') notify(tab, next, lastLine)
        }
      }
    }
  }, 1000)
}
