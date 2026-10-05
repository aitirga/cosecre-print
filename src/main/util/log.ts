import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

/**
 * A small file logger whose whole purpose is remote diagnosis: someone on a
 * machine we cannot reach opens Logs, copies or saves them, and sends them back.
 *
 * Writes are synchronous. Volume is a handful of lines per print job, and
 * synchronous appends keep the file in order without a write queue — and mean
 * the last line before a crash actually reaches the disk.
 */

type Level = 'INFO' | 'WARN' | 'ERROR'

const MAX_BYTES = 1024 * 1024
const FILE_NAME = 'cosecre-print.log'
const PREVIOUS_FILE_NAME = 'cosecre-print.old.log'

let dir: string | undefined
/** Lines logged before `initLog` ran, flushed once the folder is known. */
const early: string[] = []

export function initLog(logDir: string): void {
  dir = logDir
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Logging must never be the reason the app fails to start.
  }
  for (const line of early.splice(0)) write(line)
}

export function logDir(): string | undefined {
  return dir
}

export const log = {
  info: (message: string, ...details: unknown[]) => emit('INFO', message, details),
  warn: (message: string, ...details: unknown[]) => emit('WARN', message, details),
  error: (message: string, ...details: unknown[]) => emit('ERROR', message, details)
}

/** The previous and current log files, oldest first. */
export function readLogs(): string {
  if (!dir) return early.join('')
  return [PREVIOUS_FILE_NAME, FILE_NAME]
    .map((name) => {
      try {
        return readFileSync(join(dir!, name), 'utf8')
      } catch {
        return ''
      }
    })
    .join('')
}

export function clearLogs(): void {
  if (!dir) return
  for (const name of [PREVIOUS_FILE_NAME, FILE_NAME]) {
    try {
      writeFileSync(join(dir, name), '')
    } catch {
      // nothing to clear
    }
  }
}

function emit(level: Level, message: string, details: unknown[]): void {
  const extra = details.map(formatDetail).join(' ')
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}${extra ? ' ' + extra : ''}\n`
  // Mirror to the terminal during `npm run dev`.
  if (process.env['ELECTRON_RENDERER_URL']) process.stdout.write(line)
  if (dir) write(line)
  else early.push(line)
}

function write(line: string): void {
  const file = join(dir!, FILE_NAME)
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
      renameSync(file, join(dir!, PREVIOUS_FILE_NAME))
    }
  } catch {
    // Rotation is best-effort; carry on appending to the current file.
  }
  try {
    appendFileSync(file, line)
  } catch {
    // A full or read-only disk must not break printing.
  }
}

function formatDetail(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    // execFile errors carry the useful detail as extra properties.
    const { code, signal, killed, stdout, stderr } = value as Error & Record<string, unknown>
    return inspect(
      { message: value.message, code, signal, killed, stdout, stderr },
      { depth: 4, breakLength: Infinity }
    )
  }
  return inspect(value, { depth: 4, breakLength: Infinity })
}
