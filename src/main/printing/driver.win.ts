import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, sep } from 'node:path'
import type { PrinterInfo, PrintOptions } from '@shared/types'
import type { PrintDriver, SpoolState, SubmitResult } from './driver.js'
import { run, runPowerShell } from '../util/exec.js'
import { log } from '../util/log.js'

interface TrackedWindowsJob {
  printer: string
  /** Names the spooler might list this job under. */
  documentNames: string[]
  /** Last raw spooler status logged, so the log only records changes. */
  lastStatus?: string
}

/**
 * How long SumatraPDF may take to hand a document to the spooler. It exits as
 * soon as the job is spooled, so this is only ever reached when something is
 * waiting on input nobody can see — a driver dialog behind `-silent`, a "Save
 * as" prompt from a print-to-file printer — and without a limit that hang
 * would block this printer's queue for the rest of the session.
 */
const SUBMIT_TIMEOUT_MS = 3 * 60 * 1000

/**
 * Windows driver: a bundled SumatraPDF (shipped by `pdf-to-printer`) for
 * submission, the print spooler for status.
 *
 * The engine prints and exits without handing back a spooler job id, so unlike
 * CUPS there is no definitive handle to follow. We approximate by matching
 * queued jobs on document name, which is useful but can collide when two files
 * share a name — so every job here is reported as `submitted-only` rather than
 * claiming a fidelity the platform does not give us.
 */
export class WindowsDriver implements PrintDriver {
  readonly kind = 'windows' as const

  #counter = 0
  readonly #tracked = new Map<string, TrackedWindowsJob>()

  async listPrinters(): Promise<PrinterInfo[]> {
    try {
      const rows = await queryPrinters()
      log.info(`Found ${rows.length} printer(s)`, rows)
      return rows.map((row) => ({
        name: row.Name,
        displayName: row.Name,
        isDefault: row.Default === true,
        status: printerStatus(row)
      }))
    } catch (error) {
      log.warn('Printer query failed, falling back to pdf-to-printer', error)
    }

    const { getPrinters, getDefaultPrinter } = await loadPdfToPrinter()
    const [printers, fallback] = await Promise.all([
      getPrinters().catch((error: unknown) => {
        log.error('pdf-to-printer getPrinters failed', error)
        return []
      }),
      getDefaultPrinter().catch(() => null)
    ])
    const defaultName = fallback?.name ?? ''
    log.info('Printers via pdf-to-printer', { printers, defaultName })

    return printers.map((p) => ({
      name: p.name,
      displayName: p.name,
      isDefault: p.name === defaultName
    }))
  }

  async submit(pdfPath: string, options: PrintOptions, jobTitle: string): Promise<SubmitResult> {
    const sumatra = sumatraPath()
    const settings = sumatraSettings(options)
    const args = ['-print-to', options.printer, '-silent']
    if (settings) args.push('-print-settings', settings)
    args.push(pdfPath)

    // Runs alongside the submission: it is only there to put the printer's
    // state next to the outcome in the log.
    void this.#logPrinterState(options.printer)

    log.info('Submitting to SumatraPDF', {
      exe: sumatra,
      exeExists: existsSync(sumatra),
      pdfExists: existsSync(pdfPath),
      args
    })

    const startedAt = Date.now()
    try {
      const { stdout, stderr } = await run(sumatra, args, { timeoutMs: SUBMIT_TIMEOUT_MS })
      log.info(`SumatraPDF exited OK after ${Date.now() - startedAt} ms`, {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      })
    } catch (error) {
      log.error(`SumatraPDF failed after ${Date.now() - startedAt} ms`, error)
      throw new Error(submitFailure(error, options.printer))
    }

    const nativeJobId = `win-${++this.#counter}`
    this.#tracked.set(nativeJobId, {
      printer: options.printer,
      // A converted Word file is spooled under its PDF's name, not the .docx's.
      documentNames: [...new Set([basename(pdfPath), basename(jobTitle)])]
    })
    return { nativeJobId, tracking: 'submitted-only' }
  }

  async poll(nativeJobIds: string[]): Promise<Map<string, SpoolState>> {
    const result = new Map<string, SpoolState>()
    if (nativeJobIds.length === 0) return result

    // Group by printer so we run one spooler query per printer, not per job.
    const byPrinter = new Map<string, string[]>()
    for (const id of nativeJobIds) {
      const tracked = this.#tracked.get(id)
      if (!tracked) {
        result.set(id, 'completed')
        continue
      }
      const list = byPrinter.get(tracked.printer)
      if (list) list.push(id)
      else byPrinter.set(tracked.printer, [id])
    }

    await Promise.all(
      [...byPrinter.entries()].map(async ([printer, ids]) => {
        const jobs = await queryPrinterJobs(printer)
        if (jobs === null) {
          // Spooler query failed; leave these jobs in their current state
          // rather than falsely reporting completion.
          return
        }
        for (const id of ids) {
          const tracked = this.#tracked.get(id)
          if (!tracked) {
            result.set(id, 'completed')
            continue
          }
          const match = jobs.find((j) =>
            tracked.documentNames.some((name) => j.documentName.includes(name))
          )
          if (!match) {
            log.info(`${id} no longer in the "${printer}" queue — treating as completed`, {
              lookedFor: tracked.documentNames,
              queue: jobs
            })
            result.set(id, 'completed')
            this.#tracked.delete(id)
          } else {
            if (match.status !== tracked.lastStatus) {
              log.info(`${id} spooler status: "${match.status}"`, match)
              tracked.lastStatus = match.status
            }
            result.set(id, /printing/i.test(match.status) ? 'printing' : 'spooled')
          }
        }
      })
    )

    return result
  }

  async cancel(nativeJobId: string): Promise<void> {
    const tracked = this.#tracked.get(nativeJobId)
    if (!tracked) return
    this.#tracked.delete(nativeJobId)
    const filter = tracked.documentNames
      .map((name) => `$_.DocumentName -like ${psQuote('*' + name + '*')}`)
      .join(' -or ')
    await runPowerShell(
      `Get-PrintJob -PrinterName ${psQuote(tracked.printer)} | ` +
        `Where-Object { ${filter} } | Remove-PrintJob`
    ).catch((error: unknown) => log.warn(`Cancelling ${nativeJobId} failed`, error))
  }

  diagnose(): Promise<void> {
    return windowsDiagnostics()
  }

  async #logPrinterState(printer: string): Promise<void> {
    try {
      const rows = await queryPrinters()
      const row = rows.find((r) => r.Name === printer)
      if (row) log.info(`Printer "${printer}" is ${printerStatus(row)}`, row)
      else log.warn(`Printer "${printer}" is not installed on this machine`, {
        installed: rows.map((r) => r.Name)
      })
    } catch (error) {
      log.warn(`Could not read the state of "${printer}"`, error)
    }
  }
}

/** Everything worth knowing about the print setup, for the Logs dialog. */
async function windowsDiagnostics(): Promise<void> {
  const sumatra = sumatraPath()
  log.info('SumatraPDF', { path: sumatra, exists: existsSync(sumatra) })

  try {
    const { stdout } = await runPowerShell(
      `Get-Service -Name Spooler | Select-Object Status,StartType | ConvertTo-Json -Compress`
    )
    log.info('Print Spooler service', stdout.trim())
  } catch (error) {
    log.error('Could not read the Print Spooler service', error)
  }

  try {
    const rows = await queryPrinters()
    for (const row of rows) log.info(`Printer "${row.Name}": ${printerStatus(row)}`, row)
    if (rows.length === 0) log.warn('No printers are installed')
  } catch (error) {
    log.error('Printer query failed', error)
  }

  try {
    const { stdout } = await runPowerShell(
      `Get-PrintJob -PrinterName * -ErrorAction SilentlyContinue | ` +
        `Select-Object PrinterName,DocumentName,@{n='JobStatus';e={"$($_.JobStatus)"}},SubmittedTime | ` +
        `ConvertTo-Json -Compress`
    )
    log.info('Jobs currently in the spooler', stdout.trim() || '(none)')
  } catch (error) {
    // `-PrinterName *` is not accepted everywhere; walk the printers instead.
    try {
      const { stdout } = await runPowerShell(
        `Get-Printer | ForEach-Object { Get-PrintJob -PrinterName $_.Name } | ` +
          `Select-Object PrinterName,DocumentName,@{n='JobStatus';e={"$($_.JobStatus)"}},SubmittedTime | ` +
          `ConvertTo-Json -Compress`
      )
      log.info('Jobs currently in the spooler', stdout.trim() || '(none)')
    } catch {
      log.error('Could not list spooler jobs', error)
    }
  }
}

/**
 * The SumatraPDF that `pdf-to-printer` bundles, run directly rather than
 * through `pdf-to-printer.print()` so we get a timeout, the exit code and its
 * output.
 *
 * Electron-builder unpacks it (see `asarUnpack`), and the real file is the one
 * to run: `pdf-to-printer` tries to make that rewrite itself, but it keys off
 * `process.mainModule`, which does not exist in an ESM main process — so on its
 * own it would point Windows at a path inside the asar archive.
 */
function sumatraPath(): string {
  const require = createRequire(import.meta.url)
  const distDir = dirname(require.resolve('pdf-to-printer'))
  let exe = 'SumatraPDF-3.4.6-32.exe'
  try {
    exe = readdirSync(distDir).find((f) => /^SumatraPDF.*\.exe$/i.test(f)) ?? exe
  } catch {
    // keep the known name
  }
  const packed = join(distDir, exe)
  const unpacked = packed.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
  return existsSync(unpacked) ? unpacked : packed
}

/** SumatraPDF's `-print-settings` value, in the order pdf-to-printer builds it. */
function sumatraSettings(options: PrintOptions): string {
  const parts: string[] = []
  // Sumatra splits the whole value on commas, so the range must not carry
  // stray spaces ("1-3, 5" would leave " 5" as an unknown setting).
  const pages = options.pages.replace(/\s+/g, '')
  if (pages) parts.push(pages)
  parts.push(options.color === 'monochrome' ? 'monochrome' : 'color')
  parts.push(sumatraSide(options))
  parts.push(`paper=${options.paperSize}`)
  parts.push(`${Math.max(1, options.copies)}x`)
  return parts.join(',')
}

function submitFailure(error: unknown, printer: string): string {
  const e = error as { killed?: boolean; code?: unknown; stderr?: unknown; message?: string }
  if (e.killed) {
    return (
      `Printing to "${printer}" did not finish within ${SUBMIT_TIMEOUT_MS / 60_000} minutes. ` +
      'The printer driver may be waiting for input. See Logs for details.'
    )
  }
  if (e.code === 'ENOENT' || e.code === 'EACCES' || e.code === 'EPERM') {
    return `The print engine could not be started (${String(e.code)}). Antivirus software may be blocking it. See Logs for details.`
  }
  const stderr = typeof e.stderr === 'string' ? e.stderr.trim() : ''
  if (stderr) return stderr
  if (typeof e.code === 'number') {
    return `The print engine reported an error (exit code ${e.code}) printing to "${printer}". See Logs for details.`
  }
  return e.message ?? String(error)
}

interface PrinterRow {
  Name: string
  Default?: boolean
  PrinterStatus?: number
  WorkOffline?: boolean
  PortName?: string
  DriverName?: string
  Network?: boolean
  Shared?: boolean
}

async function queryPrinters(): Promise<PrinterRow[]> {
  const { stdout } = await runPowerShell(
    `Get-CimInstance Win32_Printer | ` +
      `Select-Object Name,Default,PrinterStatus,WorkOffline,PortName,DriverName,Network,Shared | ` +
      `ConvertTo-Json -Compress`
  )
  const text = stdout.trim()
  if (!text) return []
  const parsed: unknown = JSON.parse(text)
  // ConvertTo-Json emits a bare object when there is exactly one row.
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as PrinterRow[]
  return rows.filter((row) => typeof row?.Name === 'string' && row.Name)
}

/** Win32_Printer.PrinterStatus, in words. */
function printerStatus(row: PrinterRow): string {
  if (row.WorkOffline) return 'offline'
  switch (row.PrinterStatus) {
    case 3:
      return 'idle'
    case 4:
      return 'printing'
    case 5:
      return 'warming up'
    case 6:
      return 'stopped'
    case 7:
      return 'offline'
    default:
      return 'status unknown'
  }
}

/**
 * `pdf-to-printer` publishes a CommonJS bundle while advertising named
 * TypeScript exports. Native ESM therefore exposes the runtime API under
 * `default`, although bundlers may synthesize the named exports. Support both
 * shapes so the packaged Electron app behaves like the type declarations.
 */
async function loadPdfToPrinter(): Promise<typeof import('pdf-to-printer')> {
  const module = await import('pdf-to-printer')
  if ('getPrinters' in module) return module
  return (module as unknown as { default: typeof import('pdf-to-printer') }).default
}

interface SpoolerJob {
  documentName: string
  status: string
}

async function queryPrinterJobs(printer: string): Promise<SpoolerJob[] | null> {
  try {
    // JobStatus is a flags enum, which ConvertTo-Json would emit as a bare
    // number ("16") — stringify it so "Printing", "Error", "Offline" survive.
    const { stdout } = await runPowerShell(
      `Get-PrintJob -PrinterName ${psQuote(printer)} | ` +
        `Select-Object -Property DocumentName,@{n='JobStatus';e={"$($_.JobStatus)"}} | ` +
        `ConvertTo-Json -Compress`
    )
    const text = stdout.trim()
    if (!text) return []

    const parsed: unknown = JSON.parse(text)
    // ConvertTo-Json emits a bare object when there is exactly one job.
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows.map((row) => {
      const r = row as { DocumentName?: unknown; JobStatus?: unknown }
      return {
        documentName: typeof r.DocumentName === 'string' ? r.DocumentName : '',
        status: String(r.JobStatus ?? '')
      }
    })
  } catch (error) {
    // This runs every second while a job is tracked; log each distinct failure
    // once rather than flooding the file.
    const key = `${printer}: ${error instanceof Error ? error.message : String(error)}`
    if (key !== lastSpoolerError) {
      lastSpoolerError = key
      log.warn(`Spooler query for "${printer}" failed`, error)
    }
    return null
  }
}

let lastSpoolerError: string | undefined

function sumatraSide(options: PrintOptions): 'simplex' | 'duplexlong' | 'duplexshort' {
  switch (options.duplex) {
    case 'long-edge':
      return 'duplexlong'
    case 'short-edge':
      return 'duplexshort'
    default:
      return 'simplex'
  }
}

/** Single-quote a PowerShell string literal, doubling embedded quotes. */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
