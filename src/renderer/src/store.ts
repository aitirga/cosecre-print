import { create } from 'zustand'
import type {
  AddFilesResult,
  ConverterStatus,
  HistoryEntry,
  Job,
  PrinterInfo,
  PrintOptions,
  Settings,
  UpdateState
} from '@shared/types'

export interface Notice {
  id: number
  kind: 'error' | 'info'
  message: string
}

export type View = 'queue' | 'history'

interface AppState {
  jobs: Job[]
  history: HistoryEntry[]
  printers: PrinterInfo[]
  settings: Settings | null
  converter: ConverterStatus | null
  update: UpdateState | null

  selectedJobId: string | null
  view: View
  settingsOpen: boolean
  notices: Notice[]

  init(): Promise<void>
  select(jobId: string | null): void
  setView(view: View): void
  setSettingsOpen(open: boolean): void

  addPaths(paths: string[]): Promise<void>
  pickFiles(): Promise<void>
  refreshPrinters(): Promise<void>

  updateOptions(jobId: string, patch: Partial<PrintOptions>): Promise<void>
  applyToAll(patch: Partial<PrintOptions>): Promise<void>
  printJobs(jobIds: string[]): Promise<void>
  cancelJob(jobId: string): Promise<void>
  retryJob(jobId: string): Promise<void>
  removeJob(jobId: string): Promise<void>
  clearFinished(): Promise<void>

  clearHistory(): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<void>

  checkForUpdates(): Promise<void>
  applyUpdate(): Promise<void>

  notify(kind: Notice['kind'], message: string): void
  dismissNotice(id: number): void
}

let noticeId = 0

export const useApp = create<AppState>((set, get) => ({
  jobs: [],
  history: [],
  printers: [],
  settings: null,
  converter: null,
  update: null,
  selectedJobId: null,
  view: 'queue',
  settingsOpen: false,
  notices: [],

  async init() {
    const [printers, settings, history, jobs, converter, update] = await Promise.all([
      window.cosecrePrint.listPrinters(),
      window.cosecrePrint.getSettings(),
      window.cosecrePrint.getHistory(),
      window.cosecrePrint.getJobs(),
      window.cosecrePrint.getConverterStatus(),
      window.cosecrePrint.getUpdateState()
    ])
    set({ printers, settings, history, jobs, converter, update })

    window.cosecrePrint.onJobUpdate((next) => {
      set({ jobs: next })
      // Keep a sensible selection when the selected job is removed.
      const { selectedJobId } = get()
      if (selectedJobId && !next.some((job) => job.id === selectedJobId)) {
        set({ selectedJobId: next[0]?.id ?? null })
      }
    })
    window.cosecrePrint.onHistoryUpdate((next) => set({ history: next }))

    window.cosecrePrint.onUpdateState((next) => {
      const previous = get().update
      set({ update: next })

      // Announce a new version once, when it first becomes actionable — not on
      // every download-progress tick.
      if (next.phase === previous?.phase) return
      if (next.phase === 'ready') {
        get().notify('info', `Version ${next.newVersion} is ready — restart to install it.`)
      } else if (next.phase === 'available') {
        get().notify('info', `Version ${next.newVersion} is available to download.`)
      }
    })
  },

  select: (selectedJobId) => set({ selectedJobId }),
  setView: (view) => set({ view }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  async addPaths(paths) {
    if (paths.length === 0) return
    absorb(await window.cosecrePrint.addFiles(paths))
  },

  async pickFiles() {
    absorb(await window.cosecrePrint.pickFiles())
  },

  async refreshPrinters() {
    set({ printers: await window.cosecrePrint.refreshPrinters() })
  },

  async updateOptions(jobId, patch) {
    await window.cosecrePrint.updateJobOptions(jobId, patch)
  },

  async applyToAll(patch) {
    await window.cosecrePrint.applyOptionsToAll(patch)
    get().notify('info', 'Applied to every pending document.')
  },

  async printJobs(jobIds) {
    if (jobIds.length === 0) return
    await window.cosecrePrint.printJobs(jobIds)
  },

  async cancelJob(jobId) {
    await window.cosecrePrint.cancelJob(jobId)
  },

  async retryJob(jobId) {
    await window.cosecrePrint.retryJob(jobId)
  },

  async removeJob(jobId) {
    await window.cosecrePrint.removeJob(jobId)
  },

  async clearFinished() {
    await window.cosecrePrint.clearFinished()
  },

  async clearHistory() {
    await window.cosecrePrint.clearHistory()
    set({ history: [] })
  },

  async saveSettings(patch) {
    const settings = await window.cosecrePrint.setSettings(patch)
    // The LibreOffice path may have changed, so re-check the converter.
    const converter = await window.cosecrePrint.getConverterStatus()
    set({ settings, converter })
  },

  async checkForUpdates() {
    set({ update: await window.cosecrePrint.checkForUpdates() })
  },

  async applyUpdate() {
    await window.cosecrePrint.applyUpdate()
  },

  notify(kind, message) {
    const notice: Notice = { id: ++noticeId, kind, message }
    set((state) => ({ notices: [...state.notices, notice] }))
    setTimeout(() => get().dismissNotice(notice.id), kind === 'error' ? 8000 : 3500)
  },

  dismissNotice(id) {
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }))
  }
}))

/** Select the first new job and surface a notice for anything rejected. */
function absorb(result: AddFilesResult): void {
  const state = useApp.getState()
  if (result.jobs.length > 0 && !state.selectedJobId) {
    state.select(result.jobs[0]!.id)
  }
  for (const item of result.rejected) {
    const name = item.path.split(/[/\\]/).pop() ?? item.path
    state.notify('error', `${name} — ${item.reason}`)
  }
}
