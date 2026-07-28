import * as pdfjs from 'pdfjs-dist'
// `?url` keeps the worker a separate asset that Vite fingerprints for us;
// importing it directly would inline a second copy of the library.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = pdfjs.PDFDocumentProxy

export interface LoadedPdf {
  doc: PdfDocument
  /** Tears down the document *and* its worker. */
  destroy(): Promise<void>
}

export async function loadPdf(data: Uint8Array): Promise<LoadedPdf> {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy —
  // the same bytes are reused when the preview re-renders.
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  // `destroy` lives on the loading task, not the document proxy; calling it
  // is what actually releases the worker.
  return { doc, destroy: () => task.destroy() }
}

export interface RenderTarget {
  canvas: HTMLCanvasElement
  /** CSS pixel width the page should occupy. */
  width: number
}

export type RenderTask = ReturnType<pdfjs.PDFPageProxy['render']>

/** True for the error pdf.js throws when a render is cancelled. */
export function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException'
}

/**
 * Draw one page into a canvas at device resolution.
 *
 * `onTask` hands the caller the in-flight render so it can cancel it. That
 * matters: `getPage` returns a cached page proxy, and pdf.js refuses to render
 * the same page into the same canvas twice at once — without cancelling, a
 * second draw clears the canvas while the first is still painting and the page
 * comes out blank.
 */
export async function renderPage(
  doc: PdfDocument,
  pageNumber: number,
  target: RenderTarget,
  onTask?: (task: RenderTask) => void
): Promise<void> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = target.width / base.width
  const viewport = page.getViewport({ scale })

  const ratio = window.devicePixelRatio || 1
  const canvas = target.canvas
  canvas.width = Math.floor(viewport.width * ratio)
  canvas.height = Math.floor(viewport.height * ratio)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not get a 2D canvas context.')

  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
  })
  onTask?.(task)
  await task.promise
}
