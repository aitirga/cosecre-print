import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ConverterStatus } from '@shared/types'
import { run } from '../util/exec.js'

/** Where LibreOffice normally lives, in the order we should trust. */
const CANDIDATES: Record<string, string[]> = {
  darwin: ['/Applications/LibreOffice.app/Contents/MacOS/soffice', '/opt/homebrew/bin/soffice', '/usr/local/bin/soffice'],
  win32: [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ],
  linux: ['/usr/bin/soffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice']
}

const CONVERSION_TIMEOUT_MS = 120_000

let resolvedPath: string | undefined
let resolvedFrom: string | undefined

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Locate the `soffice` binary. An explicit override always wins so the user can
 * point at a non-standard install from Settings.
 */
export async function resolveLibreOffice(override: string): Promise<ConverterStatus> {
  const trimmed = override.trim()
  if (trimmed) {
    if (await isExecutable(trimmed)) {
      resolvedPath = trimmed
      resolvedFrom = 'settings'
      return { available: true, path: trimmed }
    }
    return {
      available: false,
      reason: `The LibreOffice path set in Settings is not an executable file:\n${trimmed}`
    }
  }

  if (resolvedPath && resolvedFrom === 'auto' && (await isExecutable(resolvedPath))) {
    return { available: true, path: resolvedPath }
  }

  for (const candidate of CANDIDATES[process.platform] ?? CANDIDATES.linux) {
    if (await isExecutable(candidate)) {
      resolvedPath = candidate
      resolvedFrom = 'auto'
      return { available: true, path: candidate }
    }
  }

  // Last resort: whatever is on PATH.
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await run(probe, ['soffice'], { timeoutMs: 5000 })
    const first = stdout.split('\n')[0]?.trim()
    if (first && (await isExecutable(first))) {
      resolvedPath = first
      resolvedFrom = 'auto'
      return { available: true, path: first }
    }
  } catch {
    // fall through to the unavailable result below
  }

  return {
    available: false,
    reason:
      'LibreOffice was not found. It is required to convert Word documents to PDF. ' +
      'Install it from libreoffice.org, or set the path to `soffice` in Settings.'
  }
}

/**
 * Convert a .docx to PDF.
 *
 * `profileDir` MUST be unique per concurrent invocation. LibreOffice is not
 * thread-safe and a second process sharing a user profile will either attach to
 * the first instance and exit without converting, or hang — which is exactly
 * what breaks parallel conversion. Passing `-env:UserInstallation` gives each
 * worker its own profile and makes concurrency safe.
 */
export async function convertToPdf(args: {
  sofficePath: string
  inputPath: string
  outputDir: string
  profileDir: string
}): Promise<string> {
  const { sofficePath, inputPath, outputDir, profileDir } = args

  // Must be a file:// URL — a bare Windows path is rejected by LibreOffice.
  const profileUrl = pathToFileURL(profileDir).href

  await run(
    sofficePath,
    [
      `-env:UserInstallation=${profileUrl}`,
      '--headless',
      '--norestore',
      '--invisible',
      '--nolockcheck',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath
    ],
    { timeoutMs: CONVERSION_TIMEOUT_MS }
  )

  // LibreOffice names the output after the input stem, but exits 0 even when it
  // silently produced nothing — so confirm the file actually exists.
  const stem = basename(inputPath, extname(inputPath))
  const expected = join(outputDir, `${stem}.pdf`)
  if (await fileExists(expected)) return expected

  // Fall back to whatever single PDF landed in the (per-job) output directory,
  // covering stems that LibreOffice rewrites.
  const entries = await readdir(outputDir).catch(() => [] as string[])
  const pdfs = entries.filter((e) => e.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 1) return join(outputDir, pdfs[0]!)

  throw new Error(
    'LibreOffice finished without producing a PDF. The document may be corrupt or password-protected.'
  )
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}
