import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { AddFilesResult, PrintOptions, Settings } from '@shared/types'
import { getDriver } from './printing/driver.js'
import type { Scheduler } from './queue/scheduler.js'
import type { HistoryStore } from './store/history.js'
import type { SettingsStore } from './store/settings.js'
import { resolveLibreOffice } from './convert/libreoffice.js'
import type { Updater } from './updater.js'
import { clearLogs, log, logDir, readLogs } from './util/log.js'
import { runDiagnostics } from './diagnostics.js'

export interface IpcContext {
  scheduler: Scheduler
  settings: SettingsStore
  history: HistoryStore
  updater: Updater
  getWindow(): BrowserWindow | null
}

export function registerIpc(ctx: IpcContext): void {
  const { scheduler, settings, history, updater } = ctx

  let printerCache: Awaited<ReturnType<Awaited<ReturnType<typeof getDriver>>['listPrinters']>> = []

  const loadPrinters = async (): Promise<typeof printerCache> => {
    const driver = await getDriver()
    try {
      printerCache = await driver.listPrinters()
    } catch (error) {
      log.error('Listing printers failed', error)
      throw error
    }
    return printerCache
  }

  ipcMain.handle(IPC.listPrinters, async () =>
    printerCache.length > 0 ? printerCache : loadPrinters()
  )
  ipcMain.handle(IPC.refreshPrinters, () => loadPrinters())

  ipcMain.handle(IPC.converterStatus, () => resolveLibreOffice(settings.get().libreOfficePath))

  ipcMain.handle(IPC.pickFiles, async (): Promise<AddFilesResult> => {
    const window = ctx.getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, openDialogOptions)
      : await dialog.showOpenDialog(openDialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { jobs: [], rejected: [] }
    }
    return scheduler.addFiles(result.filePaths)
  })

  ipcMain.handle(IPC.addFiles, (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return { jobs: [], rejected: [] } satisfies AddFilesResult
    return scheduler.addFiles(paths.filter((p): p is string => typeof p === 'string'))
  })

  ipcMain.handle(IPC.getJobs, () => scheduler.list())

  ipcMain.handle(IPC.updateJobOptions, (_event, id: string, patch: Partial<PrintOptions>) =>
    scheduler.updateOptions(id, patch)
  )

  ipcMain.handle(IPC.applyOptionsToAll, (_event, patch: Partial<PrintOptions>) =>
    scheduler.applyOptionsToAll(patch)
  )

  ipcMain.handle(IPC.removeJob, (_event, id: string) => scheduler.remove(id))
  ipcMain.handle(IPC.clearFinished, () => scheduler.clearFinished())

  ipcMain.handle(IPC.printJobs, (_event, ids: unknown) => {
    if (!Array.isArray(ids)) return
    return scheduler.printJobs(ids.filter((id): id is string => typeof id === 'string'))
  })

  ipcMain.handle(IPC.cancelJob, (_event, id: string) => scheduler.cancel(id))
  ipcMain.handle(IPC.retryJob, (_event, id: string) => scheduler.retry(id))
  ipcMain.handle(IPC.readPrintable, (_event, id: string) => scheduler.readPrintable(id))
  ipcMain.handle(IPC.reportPageCount, (_event, id: string, count: number) =>
    scheduler.reportPageCount(id, count)
  )

  ipcMain.handle(IPC.getHistory, () => history.list())
  ipcMain.handle(IPC.clearHistory, async () => {
    await history.clear()
    return history.list()
  })

  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.setSettings, async (_event, patch: Partial<Settings>) => {
    const next = await settings.update(patch)
    scheduler.applySettings(next)
    history.setLimit(next.historyLimit)
    return next
  })

  ipcMain.handle(IPC.getUpdateState, () => updater.get())
  ipcMain.handle(IPC.checkForUpdates, () => updater.check())
  ipcMain.handle(IPC.applyUpdate, () => updater.apply())

  ipcMain.handle(IPC.getLogs, () => readLogs())
  ipcMain.handle(IPC.clearLogs, () => clearLogs())
  ipcMain.handle(IPC.runDiagnostics, () => runDiagnostics())
  ipcMain.handle(IPC.openLogsFolder, async () => {
    const dir = logDir()
    if (dir) await shell.openPath(dir)
  })
  ipcMain.handle(IPC.saveLogs, async (): Promise<string | null> => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const options: Electron.SaveDialogOptions = {
      title: 'Save logs',
      defaultPath: join(app.getPath('desktop'), `cosecre-print-logs-${stamp}.txt`),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    }
    const window = ctx.getWindow()
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, readLogs(), 'utf8')
    return result.filePath
  })
}

const openDialogOptions = {
  title: 'Add documents to print',
  properties: ['openFile', 'multiSelections'] as const,
  filters: [
    { name: 'Printable documents', extensions: ['pdf', 'docx'] },
    { name: 'PDF', extensions: ['pdf'] },
    { name: 'Word', extensions: ['docx'] }
  ]
} satisfies Electron.OpenDialogOptions
