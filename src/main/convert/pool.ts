import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import PQueue from 'p-queue'
import type { ConverterStatus } from '@shared/types'
import { convertToPdf, resolveLibreOffice } from './libreoffice.js'

/**
 * Runs DOCX -> PDF conversions in parallel.
 *
 * Concurrency is bounded by a fixed set of "slots", each owning a private
 * LibreOffice profile directory. Profiles are per slot rather than per job:
 * creating one costs a first-run initialisation, so reusing them across jobs
 * keeps repeat conversions fast while still guaranteeing that no two live
 * `soffice` processes ever share a profile.
 */
export class ConversionPool {
  #queue: PQueue
  #concurrency: number
  #root?: string
  /** Profile directories not currently in use, by slot index. */
  #freeSlots: number[] = []
  #slotDirs: string[] = []

  constructor(concurrency: number) {
    this.#concurrency = clampConcurrency(concurrency)
    this.#queue = new PQueue({ concurrency: this.#concurrency })
  }

  get concurrency(): number {
    return this.#concurrency
  }

  setConcurrency(value: number): void {
    const next = clampConcurrency(value)
    if (next === this.#concurrency) return
    this.#concurrency = next
    this.#queue.concurrency = next
    // Slot list grows lazily in #acquireSlot; shrinking is handled by simply
    // leaving the extra directories unused until quit.
    this.#ensureSlots()
  }

  async status(override: string): Promise<ConverterStatus> {
    return resolveLibreOffice(override)
  }

  /**
   * Convert `inputPath`, returning the path of the produced PDF.
   * Output goes into a fresh directory so a stray extra file from LibreOffice
   * can never be mistaken for another job's result.
   */
  async convert(inputPath: string, libreOfficeOverride: string): Promise<string> {
    const status = await resolveLibreOffice(libreOfficeOverride)
    if (!status.available || !status.path) {
      throw new Error(status.reason ?? 'LibreOffice is not available.')
    }
    const sofficePath = status.path

    return this.#queue.add(async () => {
      const root = await this.#ensureRoot()
      const slot = this.#acquireSlot()
      try {
        const outputDir = await mkdtemp(join(root, 'out-'))
        return await convertToPdf({
          sofficePath,
          inputPath,
          outputDir,
          profileDir: this.#slotDirs[slot]!
        })
      } finally {
        this.#freeSlots.push(slot)
      }
    })
  }

  /** Remove every temp directory this pool created. */
  async dispose(): Promise<void> {
    this.#queue.clear()
    if (this.#root) {
      await rm(this.#root, { recursive: true, force: true }).catch(() => undefined)
      this.#root = undefined
      this.#slotDirs = []
      this.#freeSlots = []
    }
  }

  async #ensureRoot(): Promise<string> {
    if (!this.#root) {
      this.#root = await mkdtemp(join(tmpdir(), 'cosecre-print-'))
      this.#ensureSlots()
      await Promise.all(this.#slotDirs.map((dir) => mkdir(dir, { recursive: true })))
    }
    return this.#root
  }

  #ensureSlots(): void {
    if (!this.#root) return
    while (this.#slotDirs.length < this.#concurrency) {
      const index = this.#slotDirs.length
      const dir = join(this.#root, `lo-profile-${index}`)
      this.#slotDirs.push(dir)
      this.#freeSlots.push(index)
      void mkdir(dir, { recursive: true })
    }
  }

  #acquireSlot(): number {
    const slot = this.#freeSlots.pop()
    // The queue's concurrency limit guarantees a free slot, but never hand out
    // a shared profile if that invariant is ever broken — grow instead.
    if (slot === undefined) {
      const index = this.#slotDirs.length
      const dir = join(this.#root!, `lo-profile-${index}`)
      this.#slotDirs.push(dir)
      void mkdir(dir, { recursive: true })
      return index
    }
    return slot
  }
}

function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 2
  return Math.min(8, Math.max(1, Math.trunc(value)))
}
