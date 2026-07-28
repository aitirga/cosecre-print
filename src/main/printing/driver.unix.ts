import { getPrinters, getDefaultPrinter } from 'unix-print'
import type { PrinterInfo, PrintOptions } from '@shared/types'
import type { PrintDriver, SpoolState, SubmitResult } from './driver.js'
import { run, tryRun } from '../util/exec.js'

/**
 * CUPS-backed driver for macOS and Linux.
 *
 * Enumeration goes through `unix-print` (its `lpstat -lp` parsing is good and
 * takes no user input), but submission calls `lp` directly with an argv array:
 * `unix-print`'s own `print()` interpolates the path into a shell string with
 * single quotes, which breaks on filenames containing an apostrophe.
 */
export class UnixDriver implements PrintDriver {
  readonly kind = 'unix' as const

  async listPrinters(): Promise<PrinterInfo[]> {
    const [printers, fallback] = await Promise.all([
      getPrinters().catch(() => []),
      getDefaultPrinter().catch(() => null)
    ])
    const defaultName = fallback?.printer ?? ''

    return printers.map((p) => ({
      name: p.printer,
      displayName: p.description?.trim() || p.printer,
      isDefault: p.printer === defaultName,
      status: p.status ?? undefined
    }))
  }

  async submit(pdfPath: string, options: PrintOptions, jobTitle: string): Promise<SubmitResult> {
    const args = ['-d', options.printer, '-t', jobTitle, '-n', String(Math.max(1, options.copies))]

    if (options.pages.trim()) args.push('-P', options.pages.trim())
    args.push('-o', `sides=${cupsSides(options)}`)
    args.push('-o', `media=${options.paperSize}`)
    if (options.color === 'monochrome') args.push('-o', 'ColorModel=Gray')

    // `--` guards against a path that begins with a dash.
    args.push('--', pdfPath)

    const { stdout } = await run('lp', args)
    const nativeJobId = parseRequestId(stdout)

    // Without an id there is nothing to poll, so degrade honestly rather than
    // pretending the job is being tracked.
    return nativeJobId
      ? { nativeJobId, tracking: 'tracked' }
      : { tracking: 'submitted-only' }
  }

  async poll(nativeJobIds: string[]): Promise<Map<string, SpoolState>> {
    const result = new Map<string, SpoolState>()
    if (nativeJobIds.length === 0) return result

    // Two batched queries per tick regardless of how many jobs are in flight:
    // one for what is still queued, one for what is actively printing.
    const [pending, active] = await Promise.all([
      tryRun('lpstat', ['-W', 'not-completed', '-o']),
      tryRun('lpstat', ['-p'])
    ])

    // If lpstat itself failed, report nothing rather than declaring every job
    // complete — the caller keeps them in their current state.
    if (!pending) return result

    const queued = parseQueuedIds(pending.stdout)
    const printing = active ? parsePrintingIds(active.stdout) : new Set<string>()

    for (const id of nativeJobIds) {
      if (printing.has(id)) result.set(id, 'printing')
      else if (queued.has(id)) result.set(id, 'spooled')
      else result.set(id, 'completed')
    }
    return result
  }

  async cancel(nativeJobId: string): Promise<void> {
    await run('cancel', [nativeJobId])
  }
}

function cupsSides(options: PrintOptions): string {
  switch (options.duplex) {
    case 'long-edge':
      return 'two-sided-long-edge'
    case 'short-edge':
      return 'two-sided-short-edge'
    default:
      return 'one-sided'
  }
}

/** `lp` prints `request id is Brother_HL_L2400DW-42 (1 file(s))`. */
function parseRequestId(stdout: string): string | undefined {
  const match = /request id is (\S+)/i.exec(stdout)
  return match?.[1]
}

/**
 * `lpstat -o` lines start with the job id:
 *   Brother_HL_L2400DW-42   aitor   1024   Tue 28 Jul 2026 11:00:00
 */
function parseQueuedIds(stdout: string): Set<string> {
  const ids = new Set<string>()
  for (const line of stdout.split('\n')) {
    const id = line.trim().split(/\s+/)[0]
    if (id) ids.add(id)
  }
  return ids
}

/** `lpstat -p` reports `printer X now printing X-42.` for active jobs. */
function parsePrintingIds(stdout: string): Set<string> {
  const ids = new Set<string>()
  const re = /now printing (\S+?)\.?(?:\s|$)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(stdout)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  return ids
}
