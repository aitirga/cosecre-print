import { readFile } from 'node:fs/promises'
import PQueue from 'p-queue'
import {
  defaultPrintOptions,
  isTerminal,
  type AddFilesResult,
  type HistoryEntry,
  type Job,
  type JobStatus,
  type PrintOptions,
  type Settings
} from '@shared/types'
import { ConversionPool } from '../convert/pool.js'
import { getDriver } from '../printing/driver.js'
import { createJob, toHistoryEntry } from './job.js'
import type { HistoryStore } from '../store/history.js'
import type { SettingsStore } from '../store/settings.js'
import { log } from '../util/log.js'

const POLL_INTERVAL_MS = 1000

export interface SchedulerEvents {
  onJobs(jobs: Job[]): void
  onHistory(history: HistoryEntry[]): void
}

/**
 * Owns every job's lifecycle.
 *
 * Two independent kinds of parallelism:
 *  - DOCX conversions run concurrently through `ConversionPool`.
 *  - Submissions run through one serial queue *per printer*. A printer can only
 *    do one thing at a time, so serialising per printer is correct; running the
 *    queues side by side is what lets several printers work at once.
 */
export class Scheduler {
  readonly #jobs = new Map<string, Job>()
  /** In-flight DOCX conversions, so a print request can await preparation. */
  readonly #preparing = new Map<string, Promise<string>>()
  readonly #printerQueues = new Map<string, PQueue>()
  /** native spooler id -> job id, for the poll loop. */
  readonly #tracked = new Map<string, string>()
  /** Jobs the user cancelled while they were mid-flight. */
  readonly #canceled = new Set<string>()

  #pool: ConversionPool
  #timer: NodeJS.Timeout | undefined
  #emitScheduled = false

  constructor(
    private readonly settings: SettingsStore,
    private readonly history: HistoryStore,
    private readonly events: SchedulerEvents
  ) {
    this.#pool = new ConversionPool(this.settings.get().conversionConcurrency)
  }

  // ---------------------------------------------------------------- accessors

  list(): Job[] {
    return [...this.#jobs.values()].sort((a, b) => a.addedAt - b.addedAt)
  }

  get(id: string): Job | undefined {
    return this.#jobs.get(id)
  }

  async readPrintable(id: string): Promise<Uint8Array> {
    const job = this.#jobs.get(id)
    if (!job) throw new Error('Job no longer exists.')
    if (!job.printablePath) throw new Error('This document is still being prepared.')
    return new Uint8Array(await readFile(job.printablePath))
  }

  reportPageCount(id: string, pageCount: number): void {
    const job = this.#jobs.get(id)
    if (!job || !Number.isFinite(pageCount) || pageCount <= 0) return
    this.#patch(id, { pageCount: Math.trunc(pageCount) })
  }

  // -------------------------------------------------------------- adding work

  async addFiles(paths: string[]): Promise<AddFilesResult> {
    const settings = this.settings.get()
    const fallbackPrinter = settings.defaultPrinter || (await this.#systemDefaultPrinter())

    const jobs: Job[] = []
    const rejected: AddFilesResult['rejected'] = []

    for (const path of paths) {
      const check = await createJob(path, defaultPrintOptions(fallbackPrinter))
      if (check.ok) {
        this.#jobs.set(check.job.id, check.job)
        jobs.push(check.job)
        log.info(`Added ${tag(check.job)}`, {
          path,
          sizeBytes: check.job.sizeBytes,
          printer: check.job.options.printer
        })
      } else {
        rejected.push(check.rejection)
        log.warn('Rejected file', check.rejection)
      }
    }

    // Start converting Word files right away: the preview needs the PDF, so
    // there is no reason to wait for the user to press Print.
    for (const job of jobs) {
      if (job.extension === '.docx') this.#prepare(job.id)
    }

    this.#emit()
    return { jobs, rejected }
  }

  updateOptions(id: string, patch: Partial<PrintOptions>): Job | undefined {
    const job = this.#jobs.get(id)
    if (!job || isTerminal(job.status)) return job
    this.#patch(id, { options: { ...job.options, ...patch } })
    return this.#jobs.get(id)
  }

  applyOptionsToAll(patch: Partial<PrintOptions>): Job[] {
    for (const job of this.#jobs.values()) {
      if (!isTerminal(job.status) && job.status !== 'submitting') {
        job.options = { ...job.options, ...patch }
      }
    }
    this.#emit()
    return this.list()
  }

  remove(id: string): void {
    const job = this.#jobs.get(id)
    if (!job) return
    if (job.status === 'spooled' || job.status === 'printing' || job.status === 'submitting') {
      // Still live at the spooler — cancel rather than silently orphaning it.
      void this.cancel(id)
      return
    }
    this.#jobs.delete(id)
    this.#preparing.delete(id)
    this.#emit()
  }

  clearFinished(): void {
    for (const [id, job] of this.#jobs) {
      if (isTerminal(job.status)) {
        this.#jobs.delete(id)
        this.#preparing.delete(id)
      }
    }
    this.#emit()
  }

  // ------------------------------------------------------------------ printing

  async printJobs(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.#printOne(id)))
  }

  async #printOne(id: string): Promise<void> {
    const job = this.#jobs.get(id)
    if (!job) return
    if (job.status === 'submitting' || job.status === 'spooled' || job.status === 'printing') return
    if (!job.options.printer) {
      this.#fail(id, 'No printer selected.')
      return
    }
    log.info(`Print requested for ${tag(job)}`, job.options)

    this.#canceled.delete(id)
    const queue = this.#queueFor(job.options.printer)

    void queue.add(async () => {
      if (this.#canceled.has(id)) return
      const current = this.#jobs.get(id)
      if (!current) return

      try {
        // A DOCX may still be converting; wait for the existing conversion
        // rather than starting a second one.
        const printablePath = current.printablePath ?? (await this.#prepare(id))
        if (this.#canceled.has(id)) return

        this.#patch(id, { status: 'submitting', startedAt: Date.now(), error: undefined })

        const driver = await getDriver()
        const options = this.#jobs.get(id)!.options
        const result = await driver.submit(printablePath, options, current.fileName)
        log.info(`Spooler accepted ${tag(current)}`, result)

        if (this.#canceled.has(id)) {
          if (result.nativeJobId) {
            await driver.cancel(result.nativeJobId, options.printer).catch(() => undefined)
          }
          return
        }

        if (result.nativeJobId) {
          this.#tracked.set(result.nativeJobId, id)
          this.#patch(id, {
            status: 'spooled',
            tracking: result.tracking,
            nativeJobId: result.nativeJobId
          })
          this.#startPolling()
        } else {
          // Nothing to poll — the spooler accepted it and that is all we know.
          this.#patch(id, { tracking: result.tracking })
          this.#finish(id, 'completed')
        }
      } catch (error) {
        this.#fail(id, describe(error))
      }
    })
  }

  async cancel(id: string): Promise<void> {
    const job = this.#jobs.get(id)
    if (!job || isTerminal(job.status)) return

    this.#canceled.add(id)

    if (job.nativeJobId) {
      const driver = await getDriver()
      await driver.cancel(job.nativeJobId, job.options.printer).catch(() => undefined)
      this.#tracked.delete(job.nativeJobId)
    }
    this.#finish(id, 'canceled')
  }

  async retry(id: string): Promise<void> {
    const job = this.#jobs.get(id)
    if (!job) return

    this.#canceled.delete(id)
    this.#patch(id, {
      status: job.printablePath ? 'ready' : 'queued',
      error: undefined,
      nativeJobId: undefined,
      startedAt: undefined,
      finishedAt: undefined
    })
    await this.#printOne(id)
  }

  // --------------------------------------------------------------- preparation

  /** Convert a DOCX to PDF, reusing an in-flight conversion if there is one. */
  #prepare(id: string): Promise<string> {
    const existing = this.#preparing.get(id)
    if (existing) return existing

    const job = this.#jobs.get(id)
    if (!job) return Promise.reject(new Error('Job no longer exists.'))
    if (job.printablePath) return Promise.resolve(job.printablePath)

    this.#patch(id, { status: 'preparing' })

    log.info(`Converting ${tag(job)} with LibreOffice`)
    const promise = this.#pool
      .convert(job.sourcePath, this.settings.get().libreOfficePath)
      .then((pdfPath) => {
        log.info(`Converted ${tag(job)}`, { pdfPath })
        const current = this.#jobs.get(id)
        // Only advance to `ready` if nothing else moved the job on in the
        // meantime (the user may have cancelled during conversion).
        if (current && current.status === 'preparing') {
          this.#patch(id, { status: 'ready', printablePath: pdfPath })
        } else if (current) {
          this.#patch(id, { printablePath: pdfPath })
        }
        return pdfPath
      })
      .catch((error: unknown) => {
        this.#fail(id, describe(error))
        throw error
      })
      .finally(() => {
        this.#preparing.delete(id)
      })

    this.#preparing.set(id, promise)
    return promise
  }

  // ------------------------------------------------------------------ tracking

  #startPolling(): void {
    if (this.#timer || this.#tracked.size === 0) return
    this.#timer = setInterval(() => {
      void this.#poll()
    }, POLL_INTERVAL_MS)
    // Never hold the app open just to poll.
    this.#timer.unref?.()
  }

  #stopPolling(): void {
    if (!this.#timer) return
    clearInterval(this.#timer)
    this.#timer = undefined
  }

  async #poll(): Promise<void> {
    if (this.#tracked.size === 0) {
      this.#stopPolling()
      return
    }

    try {
      const driver = await getDriver()
      const ids = [...this.#tracked.keys()]
      const states = await driver.poll(ids)

      for (const [nativeId, state] of states) {
        const jobId = this.#tracked.get(nativeId)
        if (!jobId) continue

        if (state === 'completed') {
          this.#tracked.delete(nativeId)
          this.#finish(jobId, 'completed')
        } else {
          const job = this.#jobs.get(jobId)
          if (job && job.status !== state) this.#patch(jobId, { status: state })
        }
      }
    } catch (error) {
      // A transient spooler hiccup should not tear down tracking; the next
      // tick will try again.
      log.warn('Polling the spooler failed', error)
    }

    if (this.#tracked.size === 0) this.#stopPolling()
  }

  // ----------------------------------------------------------------- internals

  #queueFor(printer: string): PQueue {
    let queue = this.#printerQueues.get(printer)
    if (!queue) {
      // One job at a time per printer; queues for different printers run
      // side by side, which is where the concurrency comes from.
      queue = new PQueue({ concurrency: 1 })
      this.#printerQueues.set(printer, queue)
    }
    return queue
  }

  async #systemDefaultPrinter(): Promise<string> {
    try {
      const printers = await (await getDriver()).listPrinters()
      return printers.find((p) => p.isDefault)?.name ?? printers[0]?.name ?? ''
    } catch {
      return ''
    }
  }

  #patch(id: string, patch: Partial<Job>): void {
    const job = this.#jobs.get(id)
    if (!job) return
    Object.assign(job, patch)
    this.#emit()
  }

  #fail(id: string, message: string): void {
    const job = this.#jobs.get(id)
    if (!job || isTerminal(job.status)) return
    job.error = message
    log.error(`${tag(job)} failed: ${message}`)
    this.#finish(id, 'failed')
  }

  #finish(id: string, status: Extract<JobStatus, 'completed' | 'failed' | 'canceled'>): void {
    const job = this.#jobs.get(id)
    if (!job || isTerminal(job.status)) return

    job.status = status
    job.finishedAt = Date.now()
    if (status !== 'failed') log.info(`${tag(job)} ${status}`)
    if (job.nativeJobId) this.#tracked.delete(job.nativeJobId)

    const entry = toHistoryEntry(job)
    if (entry) {
      void this.history.add(entry).then(() => {
        this.events.onHistory(this.history.list())
      })
    }
    this.#emit()
  }

  /** Batch bursts of transitions into a single IPC message per tick. */
  #emit(): void {
    if (this.#emitScheduled) return
    this.#emitScheduled = true
    setImmediate(() => {
      this.#emitScheduled = false
      this.events.onJobs(this.list())
    })
  }

  // -------------------------------------------------------------------- config

  applySettings(settings: Settings): void {
    this.#pool.setConcurrency(settings.conversionConcurrency)
  }

  async dispose(): Promise<void> {
    this.#stopPolling()
    await this.#pool.dispose()
  }
}

/** How a job is named in the log: short enough to scan, unique enough to follow. */
function tag(job: Job): string {
  return `"${job.fileName}" [${job.id.slice(0, 8)}]`
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    // execFile errors carry the useful detail on stderr.
    const stderr = (error as { stderr?: unknown }).stderr
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim()
    return error.message
  }
  return String(error)
}
