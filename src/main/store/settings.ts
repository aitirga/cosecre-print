import { join } from 'node:path'
import { defaultSettings, type Settings } from '@shared/types'
import { readJson, writeJson } from './json-file.js'

export class SettingsStore {
  #path: string
  #value: Settings = defaultSettings()

  constructor(userDataDir: string) {
    this.#path = join(userDataDir, 'settings.json')
  }

  async load(): Promise<Settings> {
    const stored = await readJson<Partial<Settings>>(this.#path, {})
    this.#value = { ...defaultSettings(), ...stored }
    return this.#value
  }

  get(): Settings {
    return this.#value
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    this.#value = { ...this.#value, ...patch }
    await writeJson(this.#path, this.#value)
    return this.#value
  }
}
