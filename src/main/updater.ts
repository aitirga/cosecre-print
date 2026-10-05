import { app, shell } from 'electron'
import { dirname, resolve } from 'node:path'
// electron-updater is CommonJS, and this main process is ESM — the named export
// has to come off the default import or the bundle throws at load.
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/types'
import { tryRun } from './util/exec.js'
import { log } from './util/log.js'

/** Keep in sync with the `publish` block in electron-builder.yml. */
const REPO = 'aitirga/cosecre-print'
const LATEST_RELEASE_URL = `https://github.com/${REPO}/releases/latest`

/** Long enough that the first check never competes with window startup. */
const FIRST_CHECK_DELAY_MS = 8_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Whether this build can replace itself in place.
 *
 * Windows and Linux always can. macOS only can when the bundle carries a
 * Developer ID signature: Squirrel.Mac reads the running app's designated code
 * requirement before swapping it, so an unsigned — or merely ad-hoc signed —
 * bundle fails with an opaque signature error.
 *
 * This asks `codesign` rather than hardcoding "macOS cannot", so adding a
 * certificate to the release workflow switches macOS to real in-place updates
 * with no code change here.
 */
async function detectSelfInstall(): Promise<boolean> {
  if (process.platform !== 'darwin') return true

  // …/Cosecre-print.app/Contents/MacOS/Cosecre-print → …/Cosecre-print.app
  const bundle = resolve(dirname(process.execPath), '..', '..')
  // Startup waits on this, so it gets a tight leash rather than the 15s default.
  // A local bundle takes well under a second; anything slower is a hang.
  const result = await tryRun('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], {
    timeoutMs: 5_000
  })

  // codesign writes its report to stderr, and exits non-zero (so tryRun yields
  // null) when the bundle is not signed at all. An ad-hoc signature exits zero
  // but names no authority, which is why the Authority line is what we match.
  return result ? /^Authority=Developer ID Application/m.test(result.stderr) : false
}

export interface UpdaterEvents {
  onState(state: UpdateState): void
}

export class Updater {
  private state: UpdateState
  /**
   * Null in development. `electronUpdater.autoUpdater` is a lazy getter that
   * constructs the platform updater on first property access, so it is resolved
   * here rather than at import time: a dev build never touches it, and a
   * construction failure cannot stop the app from starting.
   */
  private feed: AppUpdater | null = null
  private firstCheck: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(private readonly events: UpdaterEvents) {
    this.state = {
      // An unpackaged app has no update feed to read, and electron-updater
      // throws rather than no-opping, so dev never enters the state machine.
      phase: app.isPackaged ? 'idle' : 'unsupported',
      currentVersion: app.getVersion(),
      // The pessimistic answer until init() has asked codesign. Correct as-is
      // for Windows and Linux, which can always self-install.
      canSelfInstall: process.platform !== 'darwin'
    }
  }

  /**
   * Work out what this build is capable of, then start checking. Kept out of the
   * constructor because detecting a macOS signature means shelling out to
   * codesign, and the renderer must not see a capability that later flips.
   */
  async init(): Promise<void> {
    if (!app.isPackaged) return

    const canSelfInstall = await detectSelfInstall()
    this.state = { ...this.state, canSelfInstall }

    const autoUpdater = electronUpdater.autoUpdater
    this.feed = autoUpdater

    autoUpdater.autoDownload = canSelfInstall
    autoUpdater.autoInstallOnAppQuit = canSelfInstall
    // Into the app log, not the UI — a failed update check is not the user's
    // problem, but it is exactly what to read when a release is not offered.
    autoUpdater.logger = log

    autoUpdater.on('checking-for-update', () => this.patch({ phase: 'checking' }))

    autoUpdater.on('update-not-available', () =>
      this.patch({ phase: 'up-to-date', newVersion: undefined, percent: undefined })
    )

    autoUpdater.on('update-available', (info: UpdateInfo) =>
      this.patch({
        // With autoDownload on, the download has already started by the time
        // this fires, so reporting 'available' would be a state the user never
        // gets to act on.
        phase: canSelfInstall ? 'downloading' : 'available',
        newVersion: info.version,
        percent: canSelfInstall ? 0 : undefined,
        releaseUrl: `https://github.com/${REPO}/releases/tag/v${info.version}`
      })
    )

    autoUpdater.on('download-progress', (progress: { percent: number }) =>
      this.patch({ phase: 'downloading', percent: Math.round(progress.percent) })
    )

    autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
      this.patch({ phase: 'ready', newVersion: info.version, percent: 100 })
    )

    autoUpdater.on('error', (error: Error) =>
      this.patch({ phase: 'error', message: friendly(error.message) })
    )

    this.firstCheck = setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS)
    this.interval = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
  }

  get(): UpdateState {
    return this.state
  }

  /** Ask GitHub whether there is a newer release. Never throws. */
  async check(): Promise<UpdateState> {
    if (!this.feed) return this.state

    try {
      await this.feed.checkForUpdates()
    } catch (error) {
      // A failed check is not worth interrupting the user over — printing still
      // works — so it is recorded in the state and surfaced only in Settings.
      this.patch({ phase: 'error', message: friendly(describe(error)) })
    }
    return this.state
  }

  /**
   * Restart into the new version. On platforms that cannot swap the bundle in
   * place, open the release page so the user can download the installer.
   */
  async apply(): Promise<void> {
    if (!this.state.canSelfInstall) {
      await shell.openExternal(this.state.releaseUrl ?? LATEST_RELEASE_URL)
      return
    }

    if (this.state.phase !== 'ready' || !this.feed) return

    // Let the current IPC call return before the process goes away, otherwise
    // the renderer sees the channel drop as an error.
    const feed = this.feed
    setImmediate(() => feed.quitAndInstall())
  }

  dispose(): void {
    if (this.firstCheck) clearTimeout(this.firstCheck)
    if (this.interval) clearInterval(this.interval)
    this.firstCheck = null
    this.interval = null
  }

  private patch(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.events.onState(this.state)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Translate the one electron-updater message a normal user is likely to hit.
 * Before the first release is published it reports "Unable to find latest
 * version on GitHub (…releases.atom), please ensure a production release
 * exists" — accurate for a maintainer, baffling for anyone else.
 */
function friendly(message: string): string {
  return message.includes('Unable to find latest version')
    ? 'No releases have been published yet.'
    : message
}
