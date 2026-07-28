import { join } from 'node:path'
import type { HistoryEntry } from '@shared/types'
import { readJson, writeJson } from './json-file.js'

/**
 * Append-only log of finished jobs, newest first.
 *
 * Plain JSON rather than a database: the volume is bounded by `historyLimit`
 * (hundreds of rows), and keeping it dependency-free means the app ships with
 * no native modules to rebuild per platform.
 */
export class HistoryStore {
  #path: string
  #entries: HistoryEntry[] = []
  #limit = 500
  /** Serialises writes so two fast job completions cannot interleave. */
  #writing: Promise<void> = Promise.resolve()

  constructor(userDataDir: string) {
    this.#path = join(userDataDir, 'history.json')
  }

  async load(limit: number): Promise<HistoryEntry[]> {
    this.#limit = limit
    const stored = await readJson<HistoryEntry[]>(this.#path, [])
    this.#entries = Array.isArray(stored) ? stored.slice(0, limit) : []
    return this.#entries
  }

  setLimit(limit: number): void {
    this.#limit = Math.max(1, limit)
    if (this.#entries.length > this.#limit) {
      this.#entries = this.#entries.slice(0, this.#limit)
      this.#persist()
    }
  }

  list(): HistoryEntry[] {
    return this.#entries
  }

  async add(entry: HistoryEntry): Promise<void> {
    // Retry of a job reuses its id; replace rather than duplicate.
    this.#entries = [entry, ...this.#entries.filter((e) => e.id !== entry.id)].slice(0, this.#limit)
    return this.#persist()
  }

  async clear(): Promise<void> {
    this.#entries = []
    return this.#persist()
  }

  #persist(): Promise<void> {
    this.#writing = this.#writing
      .then(() => writeJson(this.#path, this.#entries))
      .catch(() => undefined)
    return this.#writing
  }
}
