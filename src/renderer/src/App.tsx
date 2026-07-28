import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isTerminal } from '@shared/types'
import { useApp } from './store'
import { JobList } from './components/JobList'
import { PreviewPane } from './components/PreviewPane'
import { PrintSettingsPanel } from './components/PrintSettingsPanel'
import { HistoryView } from './components/HistoryView'
import { SettingsDialog } from './components/SettingsDialog'
import { Button } from './components/ui'
import {
  AlertIcon,
  CloseIcon,
  FileIcon,
  HistoryIcon,
  PlusIcon,
  PrinterIcon,
  SettingsIcon
} from './components/icons'
import { LogoMark } from './components/logo'

export default function App(): ReactNode {
  const init = useApp((s) => s.init)
  const jobs = useApp((s) => s.jobs)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const selectedJobId = useApp((s) => s.selectedJobId)
  const select = useApp((s) => s.select)
  const notices = useApp((s) => s.notices)
  const dismissNotice = useApp((s) => s.dismissNotice)
  const pickFiles = useApp((s) => s.pickFiles)
  const printJobs = useApp((s) => s.printJobs)
  const clearFinished = useApp((s) => s.clearFinished)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)
  const converter = useApp((s) => s.converter)

  useEffect(() => {
    void init()
  }, [init])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId),
    [jobs, selectedJobId]
  )

  const printable = useMemo(
    () => jobs.filter((job) => job.status === 'ready' || job.status === 'queued' || job.status === 'preparing'),
    [jobs]
  )
  const activeCount = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.status === 'submitting' || job.status === 'spooled' || job.status === 'printing'
      ).length,
    [jobs]
  )
  const finishedCount = useMemo(() => jobs.filter((job) => isTerminal(job.status)).length, [jobs])

  const needsConverter =
    converter && !converter.available && jobs.some((job) => job.extension === '.docx')

  return (
    <DropTarget>
      <div className="flex h-full flex-col bg-mist-100">
        <header className="drag-region flex shrink-0 items-center gap-3 border-b border-mist-300 bg-mist-50 px-4 py-2.5 pl-20">
          <LogoMark className="size-[19px]" />
          <span className="text-[13px] font-semibold tracking-tight text-ink-900">Cosecre-print</span>

          <nav className="ml-4 flex items-center gap-1">
            <TabButton active={view === 'queue'} onClick={() => setView('queue')}>
              <FileIcon className="size-3.5" />
              Queue
              {jobs.length > 0 && (
                <span className="ml-0.5 rounded bg-mist-300 px-1.5 text-[11px] tabular-nums">
                  {jobs.length}
                </span>
              )}
            </TabButton>
            <TabButton active={view === 'history'} onClick={() => setView('history')}>
              <HistoryIcon className="size-3.5" />
              History
            </TabButton>
          </nav>

          <div className="flex-1" />

          {activeCount > 0 && (
            <span className="text-[12px] text-accent-700">
              {activeCount} printing concurrently
            </span>
          )}

          <Button onClick={() => void pickFiles()}>
            <PlusIcon className="size-3.5" />
            Add files
          </Button>
          <Button
            variant="primary"
            disabled={printable.length === 0}
            onClick={() => void printJobs(printable.map((job) => job.id))}
          >
            <PrinterIcon className="size-3.5" />
            Print {printable.length > 0 ? `all (${printable.length})` : 'all'}
          </Button>
          <Button aria-label="Settings" className="px-2" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="size-4" />
          </Button>
        </header>

        {needsConverter && (
          <div className="flex shrink-0 items-start gap-2 border-b border-peach-200 bg-peach-100 px-4 py-2 text-[12px] text-peach-700">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{converter.reason}</span>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 underline underline-offset-2 hover:no-underline"
            >
              Open settings
            </button>
          </div>
        )}

        <main className="flex min-h-0 flex-1">
          {view === 'history' ? (
            <HistoryView />
          ) : (
            <>
              <section className="flex w-80 shrink-0 flex-col border-r border-mist-300">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
                    Documents
                  </span>
                  {finishedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void clearFinished()}
                      className="text-[11px] text-ink-500 hover:text-ink-800"
                    >
                      Clear finished
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <JobList jobs={jobs} selectedId={selectedJobId} onSelect={select} />
                </div>
              </section>

              <section className="min-w-0 flex-1">
                <PreviewPane job={selectedJob} />
              </section>

              <section className="w-72 shrink-0 overflow-auto border-l border-mist-300">
                <PrintSettingsPanel job={selectedJob} />
                {selectedJob && (
                  <div className="border-t border-mist-300 p-4">
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={
                        !selectedJob.options.printer ||
                        selectedJob.status === 'submitting' ||
                        selectedJob.status === 'spooled' ||
                        selectedJob.status === 'printing'
                      }
                      onClick={() => void printJobs([selectedJob.id])}
                    >
                      <PrinterIcon className="size-3.5" />
                      {isTerminal(selectedJob.status) ? 'Print again' : 'Print this document'}
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <SettingsDialog />

      <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] shadow-lg shadow-ink-900/10 ${
              notice.kind === 'error'
                ? 'border-blush-200 bg-blush-100 text-blush-700'
                : 'border-mist-300 bg-mist-50 text-ink-800'
            }`}
          >
            <span className="flex-1 leading-relaxed">{notice.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissNotice(notice.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </DropTarget>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick(): void
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-drag inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
        active ? 'bg-mist-200 text-ink-900' : 'text-ink-500 hover:text-ink-800'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Window-wide drop target.
 *
 * Drag events fire for every child element, so a naive enter/leave pair
 * flickers constantly; counting them is what keeps the overlay stable.
 */
function DropTarget({ children }: { children: ReactNode }): ReactNode {
  const addPaths = useApp((s) => s.addPaths)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  return (
    <div
      className="relative h-full"
      onDragEnter={(event) => {
        event.preventDefault()
        depth.current += 1
        if (event.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        depth.current = 0
        setDragging(false)
        // `File.path` was removed in Electron 32 — the real path has to come
        // from webUtils via the preload bridge.
        const paths = [...event.dataTransfer.files]
          .map((file) => window.cosecrePrint.getPathForFile(file))
          .filter((path): path is string => Boolean(path))
        void addPaths(paths)
      }}
    >
      {children}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-mist-100/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent-400 bg-mist-50/70 px-16 py-12">
            <FileIcon className="size-10 text-accent-500" />
            <p className="text-sm font-medium text-ink-900">Drop to add to the queue</p>
            <p className="text-[12px] text-ink-500">PDF and Word (.docx) files</p>
          </div>
        </div>
      )}
    </div>
  )
}
