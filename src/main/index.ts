import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApprovalDecision, BrewInventory, Lang } from '../shared/types'
import { ConversationStore } from './agent/conversations'
import { MemoryStore } from './agent/memory'
import { AgentSession } from './agent/session'
import { loadInventory } from './brew'
import { getCodexStatus, setCodexHome } from './codex/detect'
import { getSetupStatus, installCodex, signInToCodex } from './setup'

// Development / testing: keep Termless's data somewhere else.
if (process.env.TERMLESS_USER_DATA) app.setPath('userData', process.env.TERMLESS_USER_DATA)

setCodexHome(join(app.getPath('userData'), 'codex-home'))

const INVENTORY_TTL_MS = 60_000

let mainWindow: BrowserWindow | null = null

// --- Inventory cache (shared by the Installed tab and the agent's tools) ----

let inventoryCache: { at: number; value: Promise<BrewInventory> } | null = null

function getInventory(fresh = false): Promise<BrewInventory> {
  if (fresh || !inventoryCache || Date.now() - inventoryCache.at > INVENTORY_TTL_MS) {
    inventoryCache = { at: Date.now(), value: loadInventory() }
  }
  return inventoryCache.value
}

// --- Agent --------------------------------------------------------------------

const memory = new MemoryStore(join(app.getPath('userData'), 'memory.json'))
const conversations = new ConversationStore(join(app.getPath('userData'), 'conversations'))
const agent = new AgentSession({
  memory,
  conversations,
  getInventory: () => getInventory(),
  workspaceDir: join(app.getPath('userData'), 'workspace'),
  appVersion: app.getVersion()
})

agent.on('state', (state) => mainWindow?.webContents.send('agent:state', state))
agent.on('conversations', (list) => mainWindow?.webContents.send('conversations:changed', list))
agent.on('turn-completed', () => {
  // Commands may have installed or removed software.
  inventoryCache = null
  mainWindow?.webContents.send('inventory:changed')
})

// --- Window -------------------------------------------------------------------

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 600,
    title: 'Termless',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  // Links never open inside the app; web links go to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  const view = process.env.TERMLESS_VIEW
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (view) url.searchParams.set('view', view)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: view ? { view } : undefined })
  }

  // Development aid: `TERMLESS_CAPTURE=/tmp/shot.png npx electron .` saves a
  // screenshot of the window once data has had time to load, then quits.
  const capturePath = process.env.TERMLESS_CAPTURE
  if (capturePath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        await writeFile(capturePath, image.toPNG())
        app.quit()
      }, Number(process.env.TERMLESS_CAPTURE_DELAY_MS ?? 8000))
    })
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

// --- IPC ----------------------------------------------------------------------

const isLang = (value: unknown): value is Lang => value === 'en' || value === 'zh'

ipcMain.handle('inventory:get', () => getInventory(true))
ipcMain.handle('codex:status', () => getCodexStatus())
ipcMain.handle('shell:openExternal', (_event, url: unknown) => {
  if (typeof url === 'string' && isWebUrl(url)) return shell.openExternal(url)
  return undefined
})

ipcMain.handle('setup:status', () => getSetupStatus())
ipcMain.handle('setup:installCodex', (_event, lang: unknown) => installCodex(mainWindow, isLang(lang) ? lang : 'en'))
ipcMain.handle('setup:signIn', () => signInToCodex())

ipcMain.handle('agent:state', () => agent.getState())
ipcMain.handle('agent:send', (_event, text: unknown, lang: unknown) => {
  if (typeof text === 'string') void agent.send(text, isLang(lang) ? lang : 'en')
})
ipcMain.handle('agent:approve', (_event, itemId: unknown, decision: unknown) => {
  if (typeof itemId === 'string' && (decision === 'accept' || decision === 'decline')) {
    agent.respondToApproval(itemId, decision as ApprovalDecision)
  }
})
ipcMain.handle('agent:answer', (_event, itemId: unknown, answer: unknown) => {
  if (typeof itemId === 'string' && typeof answer === 'string' && answer.trim()) agent.answerQuestion(itemId, answer.trim())
})
ipcMain.handle('agent:interrupt', () => agent.interrupt())
ipcMain.handle('agent:new', () => agent.newConversation())

ipcMain.handle('conversations:list', () => agent.listConversations())
ipcMain.handle('conversations:open', (_event, id: unknown) => {
  if (typeof id === 'string') return agent.openConversation(id)
})
ipcMain.handle('conversations:delete', (_event, id: unknown) => {
  if (typeof id === 'string') return agent.deleteConversation(id)
})
ipcMain.handle('conversations:clear', () => agent.clearConversations())

ipcMain.handle('memory:get', () => memory.snapshot())
ipcMain.handle('memory:forget', (_event, id: unknown) => {
  if (typeof id === 'string') memory.forget(id)
  return memory.snapshot()
})
ipcMain.handle('memory:clear', () => {
  memory.clear()
  return memory.snapshot()
})

// --- Lifecycle ----------------------------------------------------------------

app.whenReady().then(() => {
  mainWindow = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Save what was learned in the current conversation before quitting, but
// never hold the app open for long. Calling app.quit() again after the
// async cleanup doesn't reliably finish quitting, so exit explicitly.
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  const timeout = new Promise((resolve) => setTimeout(resolve, 20_000))
  void Promise.race([agent.shutdown(), timeout]).finally(() => app.exit(0))
})

// Ctrl+C in `npm run dev`, or a test runner stopping the app.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit())
