import type { ReactNode } from 'react'
import { isTerminal, type Job } from '@shared/types'
import { formatBytes, isActive, STATUS_LABEL, STATUS_STYLE } from '../lib/format'
import { Badge, Button, EmptyState } from './ui'
import { CloseIcon, FileIcon, RetryIcon } from './icons'
import { useApp } from '../store'

export function JobList({
  jobs,
  selectedId,
  onSelect
}: {
  jobs: Job[]
  selectedId: string | null
  onSelect(id: string): void
}): ReactNode {
  const cancelJob = useApp((s) => s.cancelJob)
  const retryJob = useApp((s) => s.retryJob)
  const removeJob = useApp((s) => s.removeJob)

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<FileIcon className="size-9" />}
        title="Nothing queued"
        hint="Drag PDF or Word files into the window to get started."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {jobs.map((job) => {
        const selected = job.id === selectedId
        return (
          <li key={job.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(job.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(job.id)
                }
              }}
              className={`group w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? 'border-accent-300 bg-accent-50'
                  : 'border-mist-300 bg-mist-50 hover:border-mist-400 hover:bg-mist-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">
                  {job.fileName}
                </p>
                <Badge className={STATUS_STYLE[job.status]} pulse={isActive(job.status)}>
                  {STATUS_LABEL[job.status]}
                </Badge>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] text-ink-500">
                  {job.options.printer || 'No printer'}
                  {' · '}
                  {formatBytes(job.sizeBytes)}
                  {job.pageCount ? ` · ${job.pageCount}p` : ''}
                  {job.options.copies > 1 ? ` · ×${job.options.copies}` : ''}
                </p>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {job.status === 'failed' && (
                    <Button
                      aria-label="Retry"
                      title="Retry"
                      className="px-1.5 py-1"
                      onClick={(event) => {
                        event.stopPropagation()
                        void retryJob(job.id)
                      }}
                    >
                      <RetryIcon className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    aria-label={isTerminal(job.status) ? 'Remove' : 'Cancel'}
                    title={isTerminal(job.status) ? 'Remove' : 'Cancel'}
                    variant="danger"
                    className="px-1.5 py-1"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (isTerminal(job.status)) void removeJob(job.id)
                      else void cancelJob(job.id)
                    }}
                  >
                    <CloseIcon className="size-3.5" />
                  </Button>
                </div>
              </div>

              {job.error && (
                <p className="mt-1.5 line-clamp-2 rounded bg-blush-100 px-2 py-1 text-[11px] text-blush-700">
                  {job.error}
                </p>
              )}

              {job.tracking === 'submitted-only' && job.status === 'completed' && (
                <p className="mt-1.5 text-[11px] text-ink-500">
                  Sent to the spooler — this platform does not report per-job progress.
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
