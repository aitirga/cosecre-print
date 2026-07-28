import { basename } from 'node:path'
import type { PrinterInfo, PrintOptions } from '@shared/types'
import type { PrintDriver, SpoolState, SubmitResult } from './driver.js'
import { runPowerShell } from '../util/exec.js'

interface TrackedWindowsJob {
  printer: string
  documentName: string
}

/**
 * Windows driver, backed by `pdf-to-printer` (which drives a bundled
 * SumatraPDF) for submission and the print spooler for status.
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
    const { getPrinters, getDefaultPrinter } = await loadPdfToPrinter()
    const [printers, fallback] = await Promise.all([
      getPrinters().catch(() => []),
      getDefaultPrinter().catch(() => null)
    ])
    const defaultName = fallback?.name ?? ''

    return printers.map((p) => ({
      name: p.name,
      displayName: p.name,
      isDefault: p.name === defaultName
    }))
  }

  async submit(pdfPath: string, options: PrintOptions, jobTitle: string): Promise<SubmitResult> {
    const { print } = await loadPdfToPrinter()

    await print(pdfPath, {
      printer: options.printer,
      copies: Math.max(1, options.copies),
      ...(options.pages.trim() ? { pages: options.pages.trim() } : {}),
      side: sumatraSide(options),
      paperSize: options.paperSize,
      monochrome: options.color === 'monochrome',
      silent: true
    })

    const nativeJobId = `win-${++this.#counter}`
    this.#tracked.set(nativeJobId, {
      printer: options.printer,
      documentName: basename(jobTitle)
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
          const match = jobs.find((j) => j.documentName.includes(tracked.documentName))
          if (!match) {
            result.set(id, 'completed')
            this.#tracked.delete(id)
          } else {
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
    await runPowerShell(
      `Get-PrintJob -PrinterName ${psQuote(tracked.printer)} | ` +
        `Where-Object { $_.DocumentName -like ${psQuote('*' + tracked.documentName + '*')} } | ` +
        `Remove-PrintJob`
    ).catch(() => undefined)
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
  if ('print' in module) return module
  return (module as unknown as { default: typeof import('pdf-to-printer') }).default
}

interface SpoolerJob {
  documentName: string
  status: string
}

async function queryPrinterJobs(printer: string): Promise<SpoolerJob[] | null> {
  try {
    const { stdout } = await runPowerShell(
      `Get-PrintJob -PrinterName ${psQuote(printer)} | ` +
        `Select-Object -Property DocumentName,JobStatus | ConvertTo-Json -Compress`
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
  } catch {
    return null
  }
}

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
