/**
 * The contract shared by the main process, the preload bridge and the renderer.
 * Nothing in here may import from `electron` or from the DOM.
 */

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'] as const
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

/** Where a job is in its lifecycle. */
export type JobStatus =
  | 'queued' // accepted, not yet worked on
  | 'preparing' // converting DOCX -> PDF
  | 'ready' // has a printable PDF, awaiting a print request
  | 'submitting' // being handed to the spooler
  | 'spooled' // accepted by the spooler, waiting its turn
  | 'printing' // spooler reports it as active
  | 'completed'
  | 'failed'
  | 'canceled'

/** Statuses from which no further transition happens. */
export const TERMINAL_STATUSES: readonly JobStatus[] = ['completed', 'failed', 'canceled']

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** Statuses where the job is occupying a printer's spool. */
export const SPOOL_STATUSES: readonly JobStatus[] = ['spooled', 'printing']

/**
 * How much the platform can actually tell us about a submitted job.
 * macOS returns a CUPS job id we can poll; Windows submission returns nothing
 * addressable, so tracking there degrades to "we know it was accepted".
 */
export type TrackingMode = 'tracked' | 'submitted-only'

export type Duplex = 'simplex' | 'long-edge' | 'short-edge'
export type ColorMode = 'color' | 'monochrome'
export type PaperSize = 'A4' | 'Letter' | 'Legal' | 'A3'

export interface PrintOptions {
  printer: string
  copies: number
  /** CUPS-style page range, e.g. "1-3,5". Empty means all pages. */
  pages: string
  duplex: Duplex
  color: ColorMode
  paperSize: PaperSize
}

export function defaultPrintOptions(printer = ''): PrintOptions {
  return {
    printer,
    copies: 1,
    pages: '',
    duplex: 'simplex',
    color: 'color',
    paperSize: 'A4'
  }
}

export interface PrinterInfo {
  name: string
  /** Human-friendly name when the platform exposes one, else `name`. */
  displayName: string
  isDefault: boolean
  /** CUPS "printer X is idle/processing/disabled" text, when available. */
  status?: string
}

export interface Job {
  id: string
  /** Absolute path of the file the user dropped. */
  sourcePath: string
  fileName: string
  extension: SupportedExtension
  sizeBytes: number

  /**
   * Absolute path of the PDF that will actually be printed.
   * Equals `sourcePath` for PDFs; a converted temp file for DOCX.
   * Undefined until preparation finishes.
   */
  printablePath?: string
  pageCount?: number

  options: PrintOptions
  status: JobStatus
  tracking: TrackingMode
  /** Native spooler id, e.g. "Brother_HL_L2400DW-42". Only when tracked. */
  nativeJobId?: string
  error?: string

  addedAt: number
  startedAt?: number
  finishedAt?: number
}

export interface HistoryEntry {
  id: string
  fileName: string
  sourcePath: string
  printer: string
  copies: number
  pages: string
  duplex: Duplex
  color: ColorMode
  paperSize: PaperSize
  pageCount?: number
  sizeBytes: number
  status: Extract<JobStatus, 'completed' | 'failed' | 'canceled'>
  tracking: TrackingMode
  nativeJobId?: string
  error?: string
  addedAt: number
  startedAt?: number
  finishedAt: number
  /** Milliseconds from submission to terminal state, when known. */
  durationMs?: number
}

export interface Settings {
  defaultPrinter: string
  /** Explicit path to the `soffice` binary; empty means auto-detect. */
  libreOfficePath: string
  /** How many DOCX conversions may run at once. */
  conversionConcurrency: number
  /** Max history entries to retain. */
  historyLimit: number
}

export function defaultSettings(): Settings {
  return {
    defaultPrinter: '',
    libreOfficePath: '',
    conversionConcurrency: 4,
    historyLimit: 500
  }
}

/** Reported to the renderer so it can explain why DOCX support is unavailable. */
export interface ConverterStatus {
  available: boolean
  /** Resolved soffice path when available. */
  path?: string
  /** Why it is unavailable, phrased for a user. */
  reason?: string
}

export interface AddFilesResult {
  jobs: Job[]
  /** Files that were not accepted, with a user-facing reason. */
  rejected: { path: string; reason: string }[]
}

/** The surface exposed on `window.cosecrePrint` by the preload bridge. */
export interface CosecrePrintApi {
  listPrinters(): Promise<PrinterInfo[]>
  refreshPrinters(): Promise<PrinterInfo[]>
  getConverterStatus(): Promise<ConverterStatus>

  pickFiles(): Promise<AddFilesResult>
  addFiles(paths: string[]): Promise<AddFilesResult>
  /** Resolve the real filesystem path of a dropped File (Electron >= 32). */
  getPathForFile(file: File): string

  getJobs(): Promise<Job[]>
  updateJobOptions(jobId: string, options: Partial<PrintOptions>): Promise<Job | undefined>
  applyOptionsToAll(options: Partial<PrintOptions>): Promise<Job[]>
  removeJob(jobId: string): Promise<void>
  clearFinished(): Promise<void>

  printJobs(jobIds: string[]): Promise<void>
  cancelJob(jobId: string): Promise<void>
  retryJob(jobId: string): Promise<void>

  /** Raw bytes of the printable PDF, for rendering the preview. */
  readPrintable(jobId: string): Promise<Uint8Array>
  reportPageCount(jobId: string, pageCount: number): Promise<void>

  getHistory(): Promise<HistoryEntry[]>
  clearHistory(): Promise<void>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>

  /** Fires on every job state transition. Returns an unsubscribe function. */
  onJobUpdate(cb: (jobs: Job[]) => void): () => void
  onHistoryUpdate(cb: (history: HistoryEntry[]) => void): () => void
}
