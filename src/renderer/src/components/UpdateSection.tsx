import type { ReactNode } from 'react'
import type { UpdateState } from '@shared/types'
import { useApp } from '../store'
import { Button, Spinner } from './ui'

/**
 * The Updates block in Settings. Releases are published to GitHub; see
 * `src/main/updater.ts` for why macOS gets a download link instead of an
 * in-place install.
 */
export function UpdateSection(): ReactNode {
  const update = useApp((s) => s.update)
  const checkForUpdates = useApp((s) => s.checkForUpdates)
  const applyUpdate = useApp((s) => s.applyUpdate)

  if (!update) return null

  const busy = update.phase === 'checking' || update.phase === 'downloading'
  const action = primaryAction(update)

  return (
    <div className="border-t border-mist-300 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-ink-500 uppercase">
            Updates
          </span>
          <p className="text-[13px] text-ink-800 tabular-nums">
            Version {update.currentVersion}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {update.phase !== 'unsupported' && (
            <Button disabled={busy} onClick={() => void checkForUpdates()}>
              {update.phase === 'checking' && <Spinner className="size-3.5" />}
              Check now
            </Button>
          )}
          {action && (
            <Button variant="primary" onClick={() => void applyUpdate()}>
              {action}
            </Button>
          )}
        </div>
      </div>

      <p className={`mt-2 text-[11px] leading-relaxed ${TONE[toneOf(update.phase)]}`}>
        {statusText(update)}
      </p>

      {update.phase === 'downloading' && (
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-mist-300"
          role="progressbar"
          aria-valuenow={update.percent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-accent-600 transition-[width] duration-300"
            style={{ width: `${update.percent ?? 0}%` }}
          />
        </div>
      )}
    </div>
  )
}

const TONE = {
  good: 'text-mint-700',
  warn: 'text-peach-700',
  plain: 'text-ink-500'
} as const

function toneOf(phase: UpdateState['phase']): keyof typeof TONE {
  if (phase === 'up-to-date' || phase === 'ready') return 'good'
  if (phase === 'error') return 'warn'
  return 'plain'
}

/** The label for the action button, or null when there is nothing to act on. */
function primaryAction(update: UpdateState): string | null {
  if (update.phase === 'ready') return 'Restart and install'
  if (update.phase === 'available') return `Get ${update.newVersion}`
  return null
}

function statusText(update: UpdateState): string {
  switch (update.phase) {
    case 'unsupported':
      return 'Update checks only run in a packaged build — this is a development build.'
    case 'idle':
      return 'Checked automatically a few seconds after launch, then every six hours.'
    case 'checking':
      return 'Asking GitHub for the latest release…'
    case 'up-to-date':
      return 'This is the latest release.'
    case 'available':
      return update.canSelfInstall
        ? `Version ${update.newVersion} is available.`
        : `Version ${update.newVersion} is available. This build is unsigned, so it cannot ` +
          'replace itself — the button opens the release page to download it.'
    case 'downloading':
      return `Downloading version ${update.newVersion}…`
    case 'ready':
      return `Version ${update.newVersion} has been downloaded and installs on restart.`
    case 'error':
      return `Could not check for updates: ${update.message ?? 'unknown error'}`
  }
}
