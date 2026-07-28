import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Read a JSON file, falling back to `fallback` when it is missing or corrupt.
 * A damaged settings/history file should never stop the app from starting.
 */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/**
 * Write JSON atomically: a crash mid-write leaves the previous file intact
 * rather than a truncated one.
 */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
  await rename(temp, path)
}
