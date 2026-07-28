import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc.js'
import { Scheduler } from './queue/scheduler.js'
import { HistoryStore } from './store/history.js'
import { SettingsStore } from './store/settings.js'

const dirname = fileURLToPath(new URL('.', import.meta.url))

let mainWindow: BrowserWindow | null = null
let scheduler: Scheduler | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Cosecre-print',
    backgroundColor: '#0b0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload needs `webUtils`, which is unavailable in a sandboxed
      // renderer process; isolation still keeps Node out of the page.
      sandbox: false
    }
  })

  window.on('ready-to-show', () => window.show())

  // Keep external links out of the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(async () => {
  app.setName('Cosecre-print')

  const userData = app.getPath('userData')
  const settings = new SettingsStore(userData)
  const history = new HistoryStore(userData)

  const loaded = await settings.load()
  await history.load(loaded.historyLimit)

  scheduler = new Scheduler(settings, history, {
    onJobs: (jobs) => mainWindow?.webContents.send(IPC.jobsChanged, jobs),
    onHistory: (entries) => mainWindow?.webContents.send(IPC.historyChanged, entries)
  })

  registerIpc({
    scheduler,
    settings,
    history,
    getWindow: () => mainWindow
  })

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Remove converted PDFs and LibreOffice profile directories.
  void scheduler?.dispose()
})
