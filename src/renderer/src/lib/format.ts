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

/**
 * Tailwind classes per status, kept in one place so badges stay consistent.
 * Every pair is a pastel `-100` fill with its matching `-700` text tone, which
 * is the combination the theme guarantees at 4.5:1.
 */
export const STATUS_STYLE: Record<JobStatus, string> = {
  queued: 'bg-mist-200 text-ink-600',
  preparing: 'bg-peach-100 text-peach-700',
  ready: 'bg-aqua-100 text-aqua-700',
  submitting: 'bg-lilac-100 text-lilac-700',
  spooled: 'bg-lilac-100 text-lilac-700',
  printing: 'bg-accent-100 text-accent-700',
  completed: 'bg-mint-100 text-mint-700',
  failed: 'bg-blush-100 text-blush-700',
  canceled: 'bg-mist-200 text-ink-500'
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
