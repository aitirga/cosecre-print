import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AddFilesResult,
  ConverterStatus,
  HistoryEntry,
  Job,
  PrinterInfo,
  PrintOptions,
  CosecrePrintApi,
  Settings
} from '@shared/types'

const api: CosecrePrintApi = {
  listPrinters: () => ipcRenderer.invoke(IPC.listPrinters) as Promise<PrinterInfo[]>,
  refreshPrinters: () => ipcRenderer.invoke(IPC.refreshPrinters) as Promise<PrinterInfo[]>,
  getConverterStatus: () => ipcRenderer.invoke(IPC.converterStatus) as Promise<ConverterStatus>,

  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles) as Promise<AddFilesResult>,
  addFiles: (paths) => ipcRenderer.invoke(IPC.addFiles, paths) as Promise<AddFilesResult>,

  /**
   * Electron removed `File.path` in v32, so a dropped file's real location has
   * to come from `webUtils` in the preload. Without this, drag-and-drop silently
   * yields nothing usable.
   */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  getJobs: () => ipcRenderer.invoke(IPC.getJobs) as Promise<Job[]>,
  updateJobOptions: (jobId: string, options: Partial<PrintOptions>) =>
    ipcRenderer.invoke(IPC.updateJobOptions, jobId, options) as Promise<Job | undefined>,
  applyOptionsToAll: (options: Partial<PrintOptions>) =>
    ipcRenderer.invoke(IPC.applyOptionsToAll, options) as Promise<Job[]>,
  removeJob: (jobId: string) => ipcRenderer.invoke(IPC.removeJob, jobId) as Promise<void>,
  clearFinished: () => ipcRenderer.invoke(IPC.clearFinished) as Promise<void>,

  printJobs: (jobIds: string[]) => ipcRenderer.invoke(IPC.printJobs, jobIds) as Promise<void>,
  cancelJob: (jobId: string) => ipcRenderer.invoke(IPC.cancelJob, jobId) as Promise<void>,
  retryJob: (jobId: string) => ipcRenderer.invoke(IPC.retryJob, jobId) as Promise<void>,

  readPrintable: (jobId: string) =>
    ipcRenderer.invoke(IPC.readPrintable, jobId) as Promise<Uint8Array>,
  reportPageCount: (jobId: string, pageCount: number) =>
    ipcRenderer.invoke(IPC.reportPageCount, jobId, pageCount) as Promise<void>,

  getHistory: () => ipcRenderer.invoke(IPC.getHistory) as Promise<HistoryEntry[]>,
  clearHistory: () => ipcRenderer.invoke(IPC.clearHistory) as Promise<void>,

  getSettings: () => ipcRenderer.invoke(IPC.getSettings) as Promise<Settings>,
  setSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.setSettings, patch) as Promise<Settings>,

  onJobUpdate: (cb) => {
    const listener = (_event: unknown, jobs: Job[]): void => cb(jobs)
    ipcRenderer.on(IPC.jobsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.jobsChanged, listener)
  },
  onHistoryUpdate: (cb) => {
    const listener = (_event: unknown, entries: HistoryEntry[]): void => cb(entries)
    ipcRenderer.on(IPC.historyChanged, listener)
    return () => ipcRenderer.removeListener(IPC.historyChanged, listener)
  }
}

contextBridge.exposeInMainWorld('cosecrePrint', api)
