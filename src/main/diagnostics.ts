import { app } from 'electron'
import { arch, release, version } from 'node:os'
import { getDriver } from './printing/driver.js'
import { log } from './util/log.js'

/** Who and what is running — the first thing to read in a log someone sends in. */
export function logEnvironment(): void {
  log.info(`Cosecre-print ${app.getVersion()} starting`, {
    platform: process.platform,
    os: safe(() => `${version()} ${release()}`),
    arch: arch(),
    locale: app.getLocale(),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    execPath: process.execPath,
    userData: app.getPath('userData')
  })
}

/** Append a snapshot of the print setup to the log. Never throws. */
export async function runDiagnostics(): Promise<void> {
  log.info('--- Diagnostics ---')
  try {
    const driver = await getDriver()
    await driver.diagnose()
  } catch (error) {
    log.error('Diagnostics failed', error)
  }
  log.info('--- End of diagnostics ---')
}

function safe(read: () => string): string {
  try {
    return read()
  } catch {
    return 'unknown'
  }
}
