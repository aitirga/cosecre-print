import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Job } from '@shared/types'
import { isCancellation, loadPdf, renderPage, type LoadedPdf, type RenderTask } from '../lib/pdf'
import { Button, EmptyState, Spinner } from './ui'
import { AlertIcon, ChevronLeft, ChevronRight, FileIcon } from './icons'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function PreviewPane({ job }: { job: Job | undefined }): ReactNode {
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Guards against an out-of-order load resolving after a newer one.
  const loadToken = useRef(0)
  // The render currently painting the canvas, so a new draw can cancel it.
  const renderTask = useRef<RenderTask | null>(null)
  const pending = useRef<Promise<void>>(Promise.resolve())

  const jobId = job?.id
  const printableReady = Boolean(job?.printablePath)

  // Load the document whenever the selection changes or a conversion finishes.
  useEffect(() => {
    if (!jobId || !printableReady) {
      setLoaded(null)
      setError(null)
      return
    }

    const token = ++loadToken.current
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const bytes = await window.cosecrePrint.readPrintable(jobId)
        const next = await loadPdf(bytes)
        if (cancelled || token !== loadToken.current) {
          void next.destroy()
          return
        }
        setLoaded(next)
        setPage(1)
        void window.cosecrePrint.reportPageCount(jobId, next.doc.numPages)
      } catch (cause) {
        if (!cancelled && token === loadToken.current) {
          setLoaded(null)
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (!cancelled && token === loadToken.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [jobId, printableReady])

  // Release the worker for the previous document once it is replaced.
  useEffect(() => {
    return () => {
      if (loaded) void loaded.destroy()
    }
  }, [loaded])

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!loaded || !canvas || !container) return

    // Stop any render still in flight before touching the canvas, then wait for
    // it to actually settle — resizing and page changes fire in bursts, and
    // overlapping renders leave the page half-painted.
    renderTask.current?.cancel()
    await pending.current.catch(() => undefined)

    const available = container.clientWidth - 48
    const width = Math.max(180, available * zoom)

    const run = renderPage(loaded.doc, page, { canvas, width }, (task) => {
      renderTask.current = task
    })
    pending.current = run

    try {
      await run
      setError(null)
    } catch (cause) {
      if (!isCancellation(cause)) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (pending.current === run) renderTask.current = null
    }
  }, [loaded, page, zoom])

  useEffect(() => {
    void draw()
  }, [draw])

  // Re-render on resize so the page keeps filling the pane.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => void draw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  if (!job) {
    return (
      <EmptyState
        icon={<FileIcon className="size-10" />}
        title="No document selected"
        hint="Drop PDF or Word files anywhere in the window, then pick one to preview it."
      />
    )
  }

  if (job.extension === '.docx' && !printableReady) {
    const failed = job.status === 'failed'
    return (
      <EmptyState
        icon={failed ? <AlertIcon className="size-10" /> : <Spinner className="size-8" />}
        title={failed ? 'Could not convert this document' : 'Converting to PDF…'}
        hint={
          failed
            ? job.error
            : 'Word files are converted with LibreOffice so the preview matches exactly what gets printed.'
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-mist-300 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink-900">{job.fileName}</p>
          <p className="text-[11px] text-ink-500">
            {loaded
              ? `${loaded.doc.numPages} page${loaded.doc.numPages === 1 ? '' : 's'}`
              : 'Loading…'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous page"
            disabled={!loaded || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center text-[12px] tabular-nums text-ink-600">
            {loaded ? `${page} / ${loaded.doc.numPages}` : '—'}
          </span>
          <Button
            aria-label="Next page"
            disabled={!loaded || page >= loaded.doc.numPages}
            onClick={() => setPage((p) => Math.min(loaded?.doc.numPages ?? p, p + 1))}
            className="px-2"
          >
            <ChevronRight className="size-4" />
          </Button>

          <div className="mx-2 h-5 w-px bg-mist-300" />

          <Button
            aria-label="Zoom out"
            disabled={zoom <= ZOOM_STEPS[0]!}
            onClick={() => setZoom((z) => previousStep(z))}
            className="px-2"
          >
            −
          </Button>
          <span className="min-w-12 text-center text-[12px] tabular-nums text-ink-600">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_STEPS.at(-1)!}
            onClick={() => setZoom((z) => nextStep(z))}
            className="px-2"
          >
            +
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto bg-mist-400 p-6">
        {error ? (
          <EmptyState
            icon={<AlertIcon className="size-10" />}
            title="Could not display this document"
            hint={error}
          />
        ) : (
          <div className="flex justify-center">
            {loading && !loaded ? (
              <Spinner className="mt-16 size-8 text-ink-500" />
            ) : (
              <canvas
                ref={canvasRef}
                className="rounded bg-white shadow-xl shadow-ink-900/15 ring-1 ring-mist-400"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function nextStep(current: number): number {
  return ZOOM_STEPS.find((step) => step > current) ?? current
}

function previousStep(current: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < current) ?? current
}
