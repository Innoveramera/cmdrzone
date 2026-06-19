// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  PtyCreateOptions,
  PtyDataPayload,
  PtyExitPayload
} from '@shared/ipc'
import type { DesktopApi } from '@shared/api'
import type { UpdateState } from '@shared/update'

const api: DesktopApi = {
  pty: {
    create: (opts: PtyCreateOptions) => ipcRenderer.invoke(IPC.ptyCreate, opts),
    input: (id, data) => ipcRenderer.send(IPC.ptyInput, { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, { id, cols, rows }),
    dispose: (id) => ipcRenderer.send(IPC.ptyDispose, { id }),
    kill: (id) => ipcRenderer.send(IPC.ptyKill, { id }),
    onData: (cb) => {
      const h = (_e: unknown, p: PtyDataPayload) => cb(p)
      ipcRenderer.on(IPC.ptyData, h)
      return () => ipcRenderer.removeListener(IPC.ptyData, h)
    },
    onExit: (cb) => {
      const h = (_e: unknown, p: PtyExitPayload) => cb(p)
      ipcRenderer.on(IPC.ptyExit, h)
      return () => ipcRenderer.removeListener(IPC.ptyExit, h)
    }
  },
  env: {
    probe: () => ipcRenderer.invoke(IPC.envProbe)
  },
  durable: {
    status: () => ipcRenderer.invoke(IPC.durableStatus),
    setEnabled: (enabled) => ipcRenderer.invoke(IPC.durableSetEnabled, enabled),
    list: () => ipcRenderer.invoke(IPC.durableList)
  },
  projects: {
    scan: () => ipcRenderer.invoke(IPC.projectsScan),
    git: (path) => ipcRenderer.invoke(IPC.projectsGit, path),
    setPref: (path, key, value) => ipcRenderer.invoke(IPC.projectSetPref, { path, key, value }),
    rename: (path, newName) => ipcRenderer.invoke(IPC.projectsRename, { path, newName })
  },
  agents: {
    list: () => ipcRenderer.invoke(IPC.agentsList)
  },
  fs: {
    readDir: (path) => ipcRenderer.invoke(IPC.fsReadDir, path),
    readFile: (path) => ipcRenderer.invoke(IPC.fsReadFile, path),
    writeFile: (path, content) => ipcRenderer.invoke(IPC.fsWriteFile, { path, content })
  },
  settings: {
    getRoots: () => ipcRenderer.invoke(IPC.settingsGetRoots),
    pickRoot: () => ipcRenderer.invoke(IPC.settingsPickRoot),
    get: (key) => ipcRenderer.invoke(IPC.settingsGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC.settingsSet, { key, value })
  },
  shell: {
    reveal: (path) => ipcRenderer.send(IPC.revealInFinder, path),
    openExternal: (url) => ipcRenderer.send(IPC.openExternal, url)
  },
  clipboard: {
    write: (text) => ipcRenderer.send(IPC.clipboardWrite, text),
    read: () => ipcRenderer.invoke(IPC.clipboardRead)
  },
  board: {
    get: (path) => ipcRenderer.invoke(IPC.boardGet, path),
    saveCard: (card) => ipcRenderer.invoke(IPC.boardSaveCard, card),
    deleteCard: (id) => ipcRenderer.invoke(IPC.boardDeleteCard, id),
    saveColumn: (column) => ipcRenderer.invoke(IPC.boardSaveColumn, column),
    deleteColumn: (id) => ipcRenderer.invoke(IPC.boardDeleteColumn, id),
    addAttachment: (input) => ipcRenderer.invoke(IPC.boardAddAttachment, input),
    deleteAttachment: (id) => ipcRenderer.invoke(IPC.boardDeleteAttachment, id)
  },
  media: {
    // getPathForFile must run here in the preload: a File loses its native path token
    // when cloned across the context bridge, so the renderer can't call webUtils itself.
    pathForFile: (file) => webUtils.getPathForFile(file),
    saveTemp: (name, bytes) => ipcRenderer.invoke(IPC.mediaSaveTemp, { name, bytes })
  },
  app: {
    version: () => ipcRenderer.invoke(IPC.appGetVersion)
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    getState: () => ipcRenderer.invoke(IPC.updateGetState),
    install: () => ipcRenderer.send(IPC.updateInstall),
    onState: (cb) => {
      const h = (_e: unknown, s: UpdateState) => cb(s)
      ipcRenderer.on(IPC.updateState, h)
      return () => ipcRenderer.removeListener(IPC.updateState, h)
    }
  },
  changelog: {
    get: () => ipcRenderer.invoke(IPC.changelogGet)
  }
}

contextBridge.exposeInMainWorld('api', api)
