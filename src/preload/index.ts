import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AgentState, TermlessApi } from '../shared/types'

// The renderer gets exactly these calls and nothing else from Node/Electron.
const api: TermlessApi & { onInventoryChanged(listener: () => void): () => void } = {
  getInventory: () => ipcRenderer.invoke('inventory:get'),
  getCodexStatus: () => ipcRenderer.invoke('codex:status'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  getSetupStatus: () => ipcRenderer.invoke('setup:status'),
  installCodex: (lang) => ipcRenderer.invoke('setup:installCodex', lang),
  signInToCodex: () => ipcRenderer.invoke('setup:signIn'),

  getAgentState: () => ipcRenderer.invoke('agent:state'),
  onAgentState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: AgentState) => listener(state)
    ipcRenderer.on('agent:state', handler)
    return () => ipcRenderer.removeListener('agent:state', handler)
  },
  sendMessage: (text, lang) => ipcRenderer.invoke('agent:send', text, lang),
  respondToApproval: (itemId, decision) => ipcRenderer.invoke('agent:approve', itemId, decision),
  answerQuestion: (itemId, answer) => ipcRenderer.invoke('agent:answer', itemId, answer),
  interrupt: () => ipcRenderer.invoke('agent:interrupt'),
  newConversation: () => ipcRenderer.invoke('agent:new'),

  getMemory: () => ipcRenderer.invoke('memory:get'),
  forgetFact: (id) => ipcRenderer.invoke('memory:forget', id),
  clearMemory: () => ipcRenderer.invoke('memory:clear'),

  onInventoryChanged: (listener) => {
    const handler = () => listener()
    ipcRenderer.on('inventory:changed', handler)
    return () => ipcRenderer.removeListener('inventory:changed', handler)
  }
}

contextBridge.exposeInMainWorld('termless', api)
