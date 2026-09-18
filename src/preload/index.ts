import { contextBridge, ipcRenderer } from 'electron'
import type { TermlessApi } from '../shared/types'

// The renderer gets exactly these calls and nothing else from Node/Electron.
const api: TermlessApi = {
  getInventory: () => ipcRenderer.invoke('inventory:get'),
  getCodexStatus: () => ipcRenderer.invoke('codex:status'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
}

contextBridge.exposeInMainWorld('termless', api)
