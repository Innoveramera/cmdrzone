import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  PtyCreateOptions,
  PtyDataPayload,
  PtyExitPayload
} from '@shared/ipc'
import type { DesktopApi } from '@shared/api'

const api: DesktopApi = {
  pty: {
    create: (opts: PtyCreateOptions) => ipcRenderer.invoke(IPC.ptyCreate, opts),
    input: (id, data) => ipcRenderer.send(IPC.ptyInput, { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, { id, cols, rows }),
    dispose: (id) => ipcRenderer.send(IPC.ptyDispose, { id }),
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
  projects: {
    scan: () => ipcRenderer.invoke(IPC.projectsScan),
    git: (path) => ipcRenderer.invoke(IPC.projectsGit, path),
    setPref: (path, key, value) => ipcRenderer.invoke(IPC.projectSetPref, { path, key, value })
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
  }
}

contextBridge.exposeInMainWorld('api', api)
