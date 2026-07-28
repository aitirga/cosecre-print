import type { PrinterInfo, PrintOptions, TrackingMode } from '@shared/types'

/** What the spooler currently reports about a submitted job. */
export type SpoolState = 'spooled' | 'printing' | 'completed'

export interface SubmitResult {
  /** Native spooler id, when the platform gives us one we can poll. */
  nativeJobId?: string
  tracking: TrackingMode
}

export interface PrintDriver {
  readonly kind: 'unix' | 'windows'

  listPrinters(): Promise<PrinterInfo[]>

  /**
   * Hand a PDF to the spooler. Resolves once the spooler has accepted it —
   * not once paper comes out.
   */
  submit(pdfPath: string, options: PrintOptions, jobTitle: string): Promise<SubmitResult>

  /**
   * Report the state of the given native job ids in a single batched query.
   * Ids absent from the result are treated as finished by the caller.
   */
  poll(nativeJobIds: string[]): Promise<Map<string, SpoolState>>

  cancel(nativeJobId: string, printer: string): Promise<void>
}

let cached: PrintDriver | undefined

export async function getDriver(): Promise<PrintDriver> {
  if (cached) return cached
  if (process.platform === 'win32') {
    const { WindowsDriver } = await import('./driver.win.js')
    cached = new WindowsDriver()
  } else {
    const { UnixDriver } = await import('./driver.unix.js')
    cached = new UnixDriver()
  }
  return cached
}
