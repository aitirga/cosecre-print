import { useState, type ReactNode } from 'react'
import { isTerminal, type Duplex, type Job, type PrintOptions } from '@shared/types'
import { useApp } from '../store'
import { Button, Field, Select, TextInput } from './ui'

const PAPER_SIZES: PrintOptions['paperSize'][] = ['A4', 'Letter', 'Legal', 'A3']

const DUPLEX_LABELS: Record<Duplex, string> = {
  simplex: 'Single-sided',
  'long-edge': 'Double-sided (long edge)',
  'short-edge': 'Double-sided (short edge)'
}

export function PrintSettingsPanel({ job }: { job: Job | undefined }): ReactNode {
  const printers = useApp((s) => s.printers)
  const updateOptions = useApp((s) => s.updateOptions)
  const applyToAll = useApp((s) => s.applyToAll)
  const refreshPrinters = useApp((s) => s.refreshPrinters)
  const [pagesDraft, setPagesDraft] = useState<string | null>(null)

  if (!job) {
    return (
      <div className="p-4 text-[13px] text-ink-400">
        Select a document to choose its printer and options.
      </div>
    )
  }

  const locked = isLocked(job)
  const options = job.options

  const set = (patch: Partial<PrintOptions>): void => {
    void updateOptions(job.id, patch)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">
            Printer
          </span>
          <button
            type="button"
            onClick={() => void refreshPrinters()}
            className="no-drag text-[11px] text-ink-400 hover:text-ink-200"
          >
            Refresh
          </button>
        </div>
        <Select
          value={options.printer}
          disabled={locked}
          onChange={(event) => set({ printer: event.target.value })}
        >
          {options.printer === '' && <option value="">Select a printer…</option>}
          {printers.map((printer) => (
            <option key={printer.name} value={printer.name}>
              {printer.displayName}
              {printer.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </Select>
        {printers.length === 0 && (
          <p className="mt-1.5 text-[11px] text-amber-300">
            No printers found. Add one in your system settings, then press Refresh.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Copies">
          <TextInput
            type="number"
            min={1}
            max={999}
            value={options.copies}
            disabled={locked}
            onChange={(event) => set({ copies: clampCopies(event.target.value) })}
          />
        </Field>

        <Field label="Paper">
          <Select
            value={options.paperSize}
            disabled={locked}
            onChange={(event) =>
              set({ paperSize: event.target.value as PrintOptions['paperSize'] })
            }
          >
            {PAPER_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Pages">
        <TextInput
          placeholder="All pages — e.g. 1-3,7"
          value={pagesDraft ?? options.pages}
          disabled={locked}
          onChange={(event) => setPagesDraft(event.target.value)}
          onBlur={(event) => {
            setPagesDraft(null)
            set({ pages: normalisePages(event.target.value) })
          }}
        />
      </Field>

      <Field label="Sides">
        <Select
          value={options.duplex}
          disabled={locked}
          onChange={(event) => set({ duplex: event.target.value as Duplex })}
        >
          {(Object.keys(DUPLEX_LABELS) as Duplex[]).map((value) => (
            <option key={value} value={value}>
              {DUPLEX_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Colour">
        <Select
          value={options.color}
          disabled={locked}
          onChange={(event) => set({ color: event.target.value as PrintOptions['color'] })}
        >
          <option value="color">Colour</option>
          <option value="monochrome">Black &amp; white</option>
        </Select>
      </Field>

      <Button
        variant="ghost"
        disabled={locked}
        onClick={() => void applyToAll(job.options)}
        className="mt-1 w-full"
      >
        Apply these to every document
      </Button>

      {locked && (
        <p className="text-[11px] leading-relaxed text-ink-400">
          Options are locked once a job has been sent to the printer.
        </p>
      )}
    </div>
  )
}

/** Options stop being editable the moment a job is handed to the spooler. */
function isLocked(job: Job): boolean {
  return (
    isTerminal(job.status) ||
    job.status === 'submitting' ||
    job.status === 'spooled' ||
    job.status === 'printing'
  )
}

function clampCopies(raw: string): number {
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return 1
  return Math.min(999, Math.max(1, value))
}

/** Keep only digits, commas and hyphens so `lp` never sees junk. */
function normalisePages(raw: string): string {
  const cleaned = raw.replace(/[^0-9,\-\s]/g, '').trim()
  return /^[\d,\-\s]*$/.test(cleaned) ? cleaned.replace(/\s+/g, '') : ''
}
