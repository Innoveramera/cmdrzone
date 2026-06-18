// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { app, BrowserWindow, clipboard, ipcMain, utilityProcess, shell, dialog, nativeImage, type UtilityProcess } from 'electron'
import { join, basename } from 'node:path'
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import { IPC } from '@shared/ipc'
import type {
  PtyCreateOptions,
  PtyInputPayload,
  PtyResizePayload,
  PtyDisposePayload
} from '@shared/ipc'
import type { EnvProbeResult, ProjectNode, BoardCard, BoardColumn } from '@shared/types'
import { TMUX_SOCKET, tmuxSessionName, type DurableStatus } from '@shared/tmux'
import { composeEnv } from '@core/env/shell-path'
import { buildConf, listSessions, killSession, type TmuxCtx, type TmuxRef } from '@core/tmux/tmux'
import { initDatabase, closeDatabase, getDb } from '@core/persistence/database'
import { scanProjects } from '@core/projects/scanner'
import { gitStatus } from '@core/projects/git'
import { renameProjectFolder } from '@core/projects/rename'
import { detectProviders } from '@core/agents/providers'
import { getSetting, setSetting, getAllPrefs, setProjectPref, applyPrefs } from '@core/persistence/repos'
import { readDir, readTextFile, writeTextFile } from '@core/fs/files'
import {
  getBoard,
  saveCard as boardSaveCard,
  deleteCard as boardDeleteCard,
  saveColumn as boardSaveColumn,
  deleteColumn as boardDeleteColumn
} from '@core/board/board'
import {
  initUpdater,
  checkForUpdates,
  getUpdateState,
  quitAndInstall,
  getChangelog
} from './updater'

// Set the app name early (before userData paths/menus are derived). Dev uses a SEPARATE name so
// its data store (~/Library/Application Support/CmdrZone Dev) is isolated from the installed app's
// (~/Library/Application Support/CmdrZone) — so you can develop freely without touching daily-use data.
app.setName(process.env.ELECTRON_RENDERER_URL ? 'CmdrZone Dev' : 'CmdrZone')

function getRoots(): string[] {
  const def = JSON.stringify([join(os.homedir(), 'Development')])
  try {
    const arr = JSON.parse(getSetting('roots', def))
    return Array.isArray(arr) && arr.length ? arr : JSON.parse(def)
  } catch {
    return JSON.parse(def)
  }
}

function scanAll(): ProjectNode[] {
  const nodes = scanProjects(getRoots())
  applyPrefs(nodes, getAllPrefs())
  return nodes
}

const isDev = !!process.env.ELECTRON_RENDERER_URL

let win: BrowserWindow | null = null
let ptyHost: UtilityProcess | null = null
const livePtys = new Set<string>()
let allowQuit = false

// Durable-session (tmux) state. `tmuxRef` is null when tmux isn't installed → sessions run the
// classic non-durable way and everything below degrades to no-ops.
let tmuxRef: TmuxRef | null = null
let tmuxEnv: NodeJS.ProcessEnv = {}

/** Detect tmux and write our config once. Safe to call when tmux is absent (leaves ref null). */
async function setupTmux(): Promise<void> {
  try {
    const c = await composeEnv(['tmux'])
    const bin = c.resolved.tmux
    if (!bin) return
    const conf = join(app.getPath('userData'), 'tmux.conf')
    writeFileSync(conf, buildConf(c.shell), 'utf8')
    tmuxRef = { bin, socket: TMUX_SOCKET, conf }
    tmuxEnv = c.env
  } catch {
    tmuxRef = null
  }
}

const tmuxCtx = (): TmuxCtx | null => (tmuxRef ? { ...tmuxRef, env: tmuxEnv } : null)
const durableSetting = (): boolean => getSetting('durableSessions', '1') === '1'
const durableEnabled = (): boolean => !!tmuxRef && durableSetting()
const durableStatus = (): DurableStatus => ({ available: !!tmuxRef, enabled: durableEnabled() })

function startPtyHost(): void {
  ptyHost = utilityProcess.fork(join(__dirname, 'pty-host.js'))
  ptyHost.on('message', (msg: { type: string; id?: string; [k: string]: unknown }) => {
    if (msg.type === 'created' && msg.id) livePtys.add(msg.id)
    if (msg.type === 'exit' && msg.id) livePtys.delete(msg.id)
    if (!win || win.isDestroyed()) return
    if (msg.type === 'data') {
      win.webContents.send(IPC.ptyData, { id: msg.id, data: msg.data })
    } else if (msg.type === 'exit') {
      win.webContents.send(IPC.ptyExit, {
        id: msg.id,
        exitCode: msg.exitCode,
        signal: msg.signal
      })
    }
  })
}

function createWindow(): void {
  const saved = (() => {
    try {
      return JSON.parse(getSetting('windowBounds', 'null')) as
        | { x?: number; y?: number; width: number; height: number }
        | null
    } catch {
      return null
    }
  })()

  win = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 920,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0d12',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('close', () => {
    if (win && !win.isDestroyed()) {
      try {
        setSetting('windowBounds', JSON.stringify(win.getBounds()))
      } catch {
        /* ignore */
      }
    }
  })
  win.on('closed', () => {
    win = null
  })

  // Surface renderer warnings/errors in the main stdout (dev diagnostics).
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('RENDER_PROCESS_GONE', details.reason)
  })

  // External links always go to the OS browser, never a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // (Re)point the updater at the current window — covers macOS recreating it on reactivate.
  initUpdater(win)
}

function registerIpc(): void {
  ipcMain.handle(IPC.ptyCreate, (_e, opts: PtyCreateOptions) => {
    // When durable, hand the host a tmux ref so it attaches-or-creates a persistent session.
    ptyHost?.postMessage({ type: 'create', payload: opts, tmux: durableEnabled() ? tmuxRef : undefined })
  })

  ipcMain.on(IPC.ptyInput, (_e, p: PtyInputPayload) => {
    ptyHost?.postMessage({ type: 'input', id: p.id, data: p.data })
  })

  ipcMain.on(IPC.ptyResize, (_e, p: PtyResizePayload) => {
    ptyHost?.postMessage({ type: 'resize', id: p.id, cols: p.cols, rows: p.rows })
  })

  // Detach: tear down the client view. A durable session keeps running on the tmux server.
  ipcMain.on(IPC.ptyDispose, (_e, p: PtyDisposePayload) => {
    ptyHost?.postMessage({ type: 'dispose', id: p.id })
  })

  // Destroy for good: the user closed the tab, so kill the durable session too (idempotent).
  ipcMain.on(IPC.ptyKill, (_e, p: { id: string }) => {
    const ctx = tmuxCtx()
    if (ctx) void killSession(ctx, tmuxSessionName(p.id))
    ptyHost?.postMessage({ type: 'dispose', id: p.id })
  })

  ipcMain.handle(IPC.durableStatus, (): DurableStatus => durableStatus())
  ipcMain.handle(IPC.durableSetEnabled, (_e, enabled: boolean): DurableStatus => {
    setSetting('durableSessions', enabled ? '1' : '0')
    return durableStatus()
  })
  ipcMain.handle(IPC.durableList, async (): Promise<string[]> => {
    const ctx = tmuxCtx()
    return ctx ? listSessions(ctx) : []
  })

  ipcMain.handle(IPC.envProbe, async (): Promise<EnvProbeResult> => {
    const c = await composeEnv()
    return { shell: c.shell, home: c.home, path: c.env.PATH ?? '', resolved: c.resolved }
  })

  ipcMain.handle(IPC.projectsScan, () => scanAll())

  ipcMain.handle(IPC.projectsGit, async (_e, p: string) => {
    const c = await composeEnv()
    return gitStatus(p, c.resolved.git ?? 'git', c.env)
  })

  ipcMain.handle(
    IPC.projectSetPref,
    (_e, { path, key, value }: { path: string; key: string; value: string | null }) => {
      setProjectPref(path, key, value)
    }
  )

  ipcMain.handle(IPC.projectsRename, (_e, { path, newName }: { path: string; newName: string }) => {
    const name = newName.trim()
    if (!name) return { ok: false, error: 'Empty name' }
    const choice = win
      ? dialog.showMessageBoxSync(win, {
          type: 'warning',
          buttons: ['Rename', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          message: `Rename folder "${basename(path)}" to "${name}"?`,
          detail: `This renames the actual folder on disk:\n${path}`
        })
      : 0
    if (choice === 1) return { ok: false, error: 'cancelled' }
    return renameProjectFolder(path, name)
  })

  ipcMain.handle(IPC.agentsList, () => detectProviders())

  ipcMain.handle(IPC.fsReadDir, (_e, p: string) => readDir(p))
  ipcMain.handle(IPC.fsReadFile, (_e, p: string) => readTextFile(p))
  ipcMain.handle(IPC.fsWriteFile, (_e, { path, content }: { path: string; content: string }) =>
    writeTextFile(path, content)
  )

  ipcMain.handle(IPC.settingsGet, (_e, key: string) => getSetting(key, ''))
  ipcMain.handle(IPC.settingsSet, (_e, { key, value }: { key: string; value: string }) =>
    setSetting(key, value)
  )

  ipcMain.handle(IPC.boardGet, (_e, p: string) => getBoard(p))
  ipcMain.handle(IPC.boardSaveCard, (_e, card: BoardCard) => boardSaveCard(card))
  ipcMain.handle(IPC.boardDeleteCard, (_e, id: string) => boardDeleteCard(id))
  ipcMain.handle(IPC.boardSaveColumn, (_e, col: BoardColumn) => boardSaveColumn(col))
  ipcMain.handle(IPC.boardDeleteColumn, (_e, id: string) => boardDeleteColumn(id))

  ipcMain.handle(IPC.settingsGetRoots, () => getRoots())
  ipcMain.handle(IPC.settingsPickRoot, async (): Promise<string[] | null> => {
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose your projects folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getRoots()[0]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    const roots = [res.filePaths[0]]
    setSetting('roots', JSON.stringify(roots))
    return roots
  })

  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.updateCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updateGetState, () => getUpdateState())
  ipcMain.handle(IPC.changelogGet, () => getChangelog())
  ipcMain.on(IPC.updateInstall, () => quitAndInstall())

  // Clipboard goes through the main process (the sandboxed renderer can't read the
  // clipboard via navigator.clipboard without a permission prompt). Used by the
  // terminal's ⌘C / ⌘V handlers.
  ipcMain.on(IPC.clipboardWrite, (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle(IPC.clipboardRead, () => clipboard.readText())

  ipcMain.on(IPC.revealInFinder, (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.on(IPC.openExternal, (_e, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      void shell.openExternal(url)
    }
  })
}

/**
 * Headless Phase-0 gate: prove better-sqlite3 + node-pty load under Electron and that
 * a login-shell PTY resolves claude/node/pnpm with zero PATH fixups. Run with SB_SMOKE=1.
 */
async function runSmoke(): Promise<void> {
  const id = 'smoke-1'
  const chunks: string[] = []
  ptyHost?.on('message', (msg: { type: string; id?: string; data?: string }) => {
    if (msg.type === 'data' && msg.id === id && msg.data) chunks.push(msg.data)
  })
  ptyHost?.on('exit', (code) => console.log('PTY_HOST_EXIT', code))

  let dbOk = false
  try {
    getDb().prepare('SELECT 1 AS x').get()
    const t = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .get()
    dbOk = !!t
  } catch (err) {
    console.error('DB_FAIL', err)
  }

  const env = await composeEnv()
  ptyHost?.postMessage({
    type: 'create',
    payload: {
      id,
      cwd: `${env.home}/Development`,
      cols: 100,
      rows: 30,
      initialCommand: 'node -v; pnpm -v; claude --version'
    }
  })

  await new Promise((r) => setTimeout(r, 5000))
  const text = chunks.join('')
  const hasNodeVersion = /v\d+\.\d+\.\d+/.test(text)
  const hasClaudeVersion = /\d+\.\d+\.\d+ \(Claude Code\)/.test(text)
  const pass = dbOk && hasNodeVersion && env.resolved.claude !== null

  console.log(
    'SMOKE_RESULT ' +
      JSON.stringify(
        {
          dbOk,
          resolved: env.resolved,
          hasNodeVersion,
          hasClaudeVersion,
          outputTail: text.slice(-500),
          pass
        },
        null,
        2
      )
  )
  ptyHost?.postMessage({ type: 'dispose', id })
  app.quit()
}

app.whenReady().then(async () => {
  initDatabase(join(app.getPath('userData'), 'cmdrzone.db'))
  startPtyHost()
  registerIpc()
  await setupTmux()

  if (process.env.SB_SMOKE) {
    void runSmoke()
    setTimeout(() => process.exit(0), 15000).unref()
    return
  }

  if (process.env.SB_SCAN) {
    const nodes = scanAll()
    const summarise = (n: ProjectNode) => ({
      name: n.name,
      kind: n.kind,
      type: n.type,
      claudeMd: n.hasClaudeMd,
      tasksMd: n.hasTasksMd,
      env: n.hasEnv,
      scripts: n.scripts ? Object.keys(n.scripts).length : 0,
      children: n.children?.map((c) => `${c.name}:${c.type}`)
    })
    console.log(
      'SCAN_RESULT ' +
        JSON.stringify(
          {
            count: nodes.length,
            groups: nodes.filter((n) => n.kind === 'group').map((n) => n.name),
            docs: nodes.filter((n) => n.kind === 'docs').map((n) => n.name),
            nodes: nodes.map(summarise)
          },
          null,
          2
        )
    )
    app.quit()
    return
  }

  if (process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (e) => {
  // With durable sessions on, quitting only detaches — agents keep running in the background
  // tmux server and reattach next launch — so there's nothing to warn about.
  if (!allowQuit && !durableEnabled() && livePtys.size > 0 && win && !win.isDestroyed()) {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Quit anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `${livePtys.size} terminal${livePtys.size > 1 ? 's are' : ' is'} still running`,
      detail: 'Quitting will end all running agents and terminals.'
    })
    if (choice === 1) {
      e.preventDefault()
      return
    }
    allowQuit = true
  }
  ptyHost?.kill()
  closeDatabase()
})

// Surface the dev flag for future conditional behaviour.
void isDev
