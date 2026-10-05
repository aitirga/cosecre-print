import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../store'
import { Button, Spinner } from './ui'
import { CloseIcon } from './icons'

const REFRESH_MS = 2000

/**
 * The app's diagnostic log, meant to be copied or saved and sent to whoever is
 * debugging a machine they cannot reach.
 */
export function LogsDialog(): ReactNode {
  const open = useApp((s) => s.logsOpen)
  const setOpen = useApp((s) => s.setLogsOpen)
  const notify = useApp((s) => s.notify)

  const [text, setText] = useState('')
  const [checking, setChecking] = useState(false)
  const pre = useRef<HTMLPreElement>(null)
  /** Follow new lines only while the reader is already at the bottom. */
  const pinned = useRef(true)

  const refresh = useCallback(async () => {
    setText(await window.cosecrePrint.getLogs())
  }, [])

  useEffect(() => {
    if (!open) return
    pinned.current = true
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [open, refresh])

  useLayoutEffect(() => {
    if (pinned.current && pre.current) pre.current.scrollTop = pre.current.scrollHeight
  }, [text, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const runCheck = async (): Promise<void> => {
    setChecking(true)
    pinned.current = true
    try {
      await window.cosecrePrint.runDiagnostics()
      await refresh()
    } finally {
      setChecking(false)
    }
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(await window.cosecrePrint.getLogs())
      notify('info', 'Logs copied to the clipboard.')
    } catch {
      notify('error', 'Could not copy the logs. Use “Save…” instead.')
    }
  }

  const save = async (): Promise<void> => {
    try {
      const path = await window.cosecrePrint.saveLogs()
      if (path) notify('info', `Logs saved to ${path}`)
    } catch {
      notify('error', 'Could not save the logs.')
    }
  }

  const clear = async (): Promise<void> => {
    await window.cosecrePrint.clearLogs()
    await refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-6 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Logs"
        className="flex h-full max-h-[760px] w-full max-w-4xl flex-col rounded-xl border border-mist-300 bg-mist-50 shadow-2xl shadow-ink-900/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mist-300 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Logs</h2>
            <p className="text-[11px] text-ink-500">
              If printing is not working, try printing once, then press Copy or Save… and send
              the result.
            </p>
          </div>
          <Button aria-label="Close" className="px-1.5 py-1" onClick={() => setOpen(false)}>
            <CloseIcon className="size-4" />
          </Button>
        </div>

        <pre
          ref={pre}
          onScroll={(event) => {
            const el = event.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="min-h-0 flex-1 overflow-auto bg-mist-100 px-4 py-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-ink-800 select-text"
        >
          {text || 'Nothing logged yet.'}
        </pre>

        <div className="flex flex-wrap items-center gap-2 border-t border-mist-300 px-5 py-3">
          <Button disabled={checking} onClick={() => void runCheck()}>
            {checking && <Spinner className="size-3.5" />}
            Check printers
          </Button>
          <Button onClick={() => void window.cosecrePrint.openLogsFolder()}>Open folder</Button>
          <Button variant="danger" onClick={() => void clear()}>
            Clear
          </Button>
          <div className="flex-1" />
          <Button onClick={() => void save()}>Save…</Button>
          <Button variant="primary" onClick={() => void copy()}>
            Copy
          </Button>
        </div>
      </div>
    </div>
  )
}
