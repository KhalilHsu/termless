import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadInventory } from './brew'
import { getCodexStatus } from './codex'

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
  const query = view ? { view } : undefined
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (view) url.searchParams.set('view', view)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }

  // Development aid: `TERMLESS_CAPTURE=/tmp/shot.png npm start` saves a
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

  return win
}

ipcMain.handle('inventory:get', () => loadInventory())
ipcMain.handle('codex:status', () => getCodexStatus())
ipcMain.handle('shell:openExternal', (_event, url: unknown) => {
  if (typeof url === 'string' && isWebUrl(url)) return shell.openExternal(url)
  return undefined
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
