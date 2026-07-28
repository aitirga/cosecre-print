import type { JobStatus } from '@shared/types'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  preparing: 'Converting',
  ready: 'Ready',
  submitting: 'Sending',
  spooled: 'In queue',
  printing: 'Printing',
  completed: 'Done',
  failed: 'Failed',
  canceled: 'Canceled'
}

/** Tailwind classes per status, kept in one place so badges stay consistent. */
export const STATUS_STYLE: Record<JobStatus, string> = {
  queued: 'bg-ink-700 text-ink-200',
  preparing: 'bg-amber-500/15 text-amber-300',
  ready: 'bg-sky-500/15 text-sky-300',
  submitting: 'bg-violet-500/15 text-violet-300',
  spooled: 'bg-violet-500/15 text-violet-300',
  printing: 'bg-accent/20 text-accent',
  completed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-rose-500/15 text-rose-300',
  canceled: 'bg-ink-700 text-ink-300'
}

/** Statuses that should show motion in the UI. */
export function isActive(status: JobStatus): boolean {
  return (
    status === 'preparing' ||
    status === 'submitting' ||
    status === 'spooled' ||
    status === 'printing'
  )
}
