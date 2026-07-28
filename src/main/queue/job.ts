import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import {
  SUPPORTED_EXTENSIONS,
  defaultPrintOptions,
  type Job,
  type HistoryEntry,
  type PrintOptions,
  type SupportedExtension
} from '@shared/types'

export interface FileRejection {
  path: string
  reason: string
}

export type FileCheck =
  | { ok: true; job: Job }
  | { ok: false; rejection: FileRejection }

/** Validate a dropped path and turn it into a fresh job. */
export async function createJob(path: string, options: PrintOptions): Promise<FileCheck> {
  const extension = extname(path).toLowerCase()

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      rejection: {
        path,
        reason: extension
          ? `${extension} files are not supported (only PDF and Word .docx).`
          : 'Only PDF and Word .docx files are supported.'
      }
    }
  }

  let sizeBytes: number
  try {
    const info = await stat(path)
    if (!info.isFile()) {
      return { ok: false, rejection: { path, reason: 'Not a file.' } }
    }
    if (info.size === 0) {
      return { ok: false, rejection: { path, reason: 'File is empty.' } }
    }
    sizeBytes = info.size
  } catch {
    return { ok: false, rejection: { path, reason: 'File could not be read.' } }
  }

  const isPdf = extension === '.pdf'

  return {
    ok: true,
    job: {
      id: randomUUID(),
      sourcePath: path,
      fileName: basename(path),
      extension: extension as SupportedExtension,
      sizeBytes,
      // PDFs are already printable; DOCX has to go through LibreOffice first.
      printablePath: isPdf ? path : undefined,
      status: isPdf ? 'ready' : 'queued',
      tracking: 'tracked',
      options: { ...options },
      addedAt: Date.now()
    }
  }
}

export function toHistoryEntry(job: Job): HistoryEntry | null {
  if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'canceled') {
    return null
  }
  const finishedAt = job.finishedAt ?? Date.now()
  return {
    id: job.id,
    fileName: job.fileName,
    sourcePath: job.sourcePath,
    printer: job.options.printer,
    copies: job.options.copies,
    pages: job.options.pages,
    duplex: job.options.duplex,
    color: job.options.color,
    paperSize: job.options.paperSize,
    pageCount: job.pageCount,
    sizeBytes: job.sizeBytes,
    status: job.status,
    tracking: job.tracking,
    nativeJobId: job.nativeJobId,
    error: job.error,
    addedAt: job.addedAt,
    startedAt: job.startedAt,
    finishedAt,
    durationMs: job.startedAt ? finishedAt - job.startedAt : undefined
  }
}

export { defaultPrintOptions }
