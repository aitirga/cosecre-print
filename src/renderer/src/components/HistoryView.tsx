import { useMemo, useState, type ReactNode } from 'react'
import type { HistoryEntry } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, formatDuration, formatTime, STATUS_LABEL, STATUS_STYLE } from '../lib/format'
import { Badge, Button, EmptyState, Select, TextInput } from './ui'
import { HistoryIcon } from './icons'

type StatusFilter = 'all' | HistoryEntry['status']

export function HistoryView(): ReactNode {
  const history = useApp((s) => s.history)
  const clearHistory = useApp((s) => s.clearHistory)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return history.filter((entry) => {
      if (status !== 'all' && entry.status !== status) return false
      if (!needle) return true
      return (
        entry.fileName.toLowerCase().includes(needle) ||
        entry.printer.toLowerCase().includes(needle)
      )
    })
  }, [history, query, status])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2.5">
        <TextInput
          placeholder="Search by file or printer…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="max-w-40"
        >
          <option value="all">All statuses</option>
          <option value="completed">Done</option>
          <option value="failed">Failed</option>
          <option value="canceled">Canceled</option>
        </Select>
        <div className="flex-1" />
        <span className="text-[12px] text-ink-400">
          {filtered.length} of {history.length}
        </span>
        <Button
          variant="danger"
          disabled={history.length === 0}
          onClick={() => void clearHistory()}
        >
          Clear
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="size-10" />}
          title={history.length === 0 ? 'No print history yet' : 'Nothing matches that filter'}
          hint={
            history.length === 0
              ? 'Finished jobs are recorded here automatically.'
              : undefined
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 bg-ink-900">
              <tr className="border-b border-ink-800 text-left text-[11px] tracking-wide text-ink-400 uppercase">
                <th className="px-4 py-2 font-medium">Document</th>
                <th className="px-3 py-2 font-medium">Printer</th>
                <th className="px-3 py-2 font-medium">Settings</th>
                <th className="px-3 py-2 font-medium">Finished</th>
                <th className="px-3 py-2 font-medium">Took</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={`${entry.id}-${entry.finishedAt}`} className="border-b border-ink-850">
                  <td className="max-w-64 px-4 py-2.5">
                    <p className="truncate text-ink-100" title={entry.sourcePath}>
                      {entry.fileName}
                    </p>
                    <p className="text-[11px] text-ink-400">
                      {formatBytes(entry.sizeBytes)}
                      {entry.pageCount ? ` · ${entry.pageCount} pages` : ''}
                    </p>
                    {entry.error && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-rose-300">{entry.error}</p>
                    )}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2.5 text-ink-300">{entry.printer}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-400">
                    {entry.copies > 1 ? `×${entry.copies} · ` : ''}
                    {entry.pages || 'all'}
                    {entry.duplex !== 'simplex' ? ' · duplex' : ''}
                    {entry.color === 'monochrome' ? ' · b&w' : ''}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-300">
                    {formatTime(entry.finishedAt)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-300">
                    {formatDuration(entry.durationMs)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={STATUS_STYLE[entry.status]}>
                      {STATUS_LABEL[entry.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
