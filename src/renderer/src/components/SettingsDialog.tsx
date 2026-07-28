import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../store'
import { Button, Field, Select, TextInput } from './ui'
import { CloseIcon } from './icons'

export function SettingsDialog(): ReactNode {
  const open = useApp((s) => s.settingsOpen)
  const setOpen = useApp((s) => s.setSettingsOpen)
  const settings = useApp((s) => s.settings)
  const converter = useApp((s) => s.converter)
  const printers = useApp((s) => s.printers)
  const saveSettings = useApp((s) => s.saveSettings)

  const [libreOfficePath, setLibreOfficePath] = useState('')

  useEffect(() => {
    if (open && settings) setLibreOfficePath(settings.libreOfficePath)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || !settings) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Settings"
        className="w-full max-w-lg rounded-xl border border-ink-700 bg-ink-850 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-100">Settings</h2>
          <Button aria-label="Close" className="px-1.5 py-1" onClick={() => setOpen(false)}>
            <CloseIcon className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <Field label="Default printer for new documents">
            <Select
              value={settings.defaultPrinter}
              onChange={(event) => void saveSettings({ defaultPrinter: event.target.value })}
            >
              <option value="">Use the system default</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <Field label="LibreOffice path (for Word files)">
              <TextInput
                placeholder="Auto-detected — leave blank unless it lives somewhere unusual"
                value={libreOfficePath}
                onChange={(event) => setLibreOfficePath(event.target.value)}
                onBlur={() => void saveSettings({ libreOfficePath })}
              />
            </Field>
            <p
              className={`mt-1.5 text-[11px] leading-relaxed ${
                converter?.available ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {converter?.available
                ? `Found at ${converter.path}`
                : (converter?.reason ??
                  'LibreOffice is required to print Word documents.')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Parallel conversions">
              <TextInput
                type="number"
                min={1}
                max={8}
                value={settings.conversionConcurrency}
                onChange={(event) =>
                  void saveSettings({
                    conversionConcurrency: clamp(event.target.value, 1, 8, 4)
                  })
                }
              />
            </Field>

            <Field label="History entries kept">
              <TextInput
                type="number"
                min={10}
                max={5000}
                step={10}
                value={settings.historyLimit}
                onChange={(event) =>
                  void saveSettings({ historyLimit: clamp(event.target.value, 10, 5000, 500) })
                }
              />
            </Field>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-400">
            Word documents are converted to PDF with LibreOffice before printing, so the preview
            matches the printed output exactly.
          </p>
        </div>
      </div>
    </div>
  )
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}
