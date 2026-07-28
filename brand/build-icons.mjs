/**
 * Regenerates the derived brand assets from their sources.
 *
 *   brand/icon.svg               ->  build/icon.png   (1024x1024, consumed by electron-builder)
 *   brand/wordmark.html          ->  brand/wordmark.png (README banner)
 *   brand/concepts/concepts.html ->  brand/concepts/concepts.png (the record sheet)
 *
 * Run with `npm run brand`.
 *
 * The outputs are committed to the repo on purpose. Packaging happens in CI on
 * runners that have neither librsvg nor Chrome, so the build must never depend
 * on this script having run — it is a local authoring convenience only.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const brandDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(brandDir, '..')

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
]

function run(command, args) {
  execFileSync(command, args, { stdio: ['ignore', 'ignore', 'inherit'] })
}

/** Resolve a binary from PATH, or return null if it is not installed. */
function which(binary) {
  try {
    return execFileSync('which', [binary], { encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}

function requireTool(binary, installHint) {
  const found = which(binary)
  if (!found) {
    console.error(`✗ ${binary} not found. Install it with: ${installHint}`)
    process.exit(1)
  }
  return found
}

function findChrome() {
  const fromPath = which('google-chrome') ?? which('chromium')
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ?? fromPath
  if (!found) {
    console.error('✗ Chrome not found. Install Google Chrome, or skip the wordmark.')
    process.exit(1)
  }
  return found
}

// ---------------------------------------------------------------- app icon
// librsvg renders the gradients correctly; ImageMagick's built-in SVG reader
// does not, so it is not an acceptable fallback here.
const rsvg = requireTool('rsvg-convert', 'brew install librsvg')
const iconOut = join(repoRoot, 'build', 'icon.png')
mkdirSync(dirname(iconOut), { recursive: true })

run(rsvg, [
  '--width=1024',
  '--height=1024',
  '--format=png',
  `--output=${iconOut}`,
  join(brandDir, 'icon.svg')
])
console.log('✓ build/icon.png (1024x1024)')

// ------------------------------------------------------- HTML-backed assets
const chrome = findChrome()
const magick = which('magick') ?? requireTool('convert', 'brew install imagemagick')

/**
 * Screenshot an HTML file at 2x. Chrome paints onto a fixed canvas, so `trim`
 * crops back to the artwork afterwards — that is what keeps a transparent PNG
 * exactly the size of what was drawn. Pages that paint their own opaque
 * background pass `trim: false`, since there is nothing to crop away.
 */
function shoot(source, output, { window: windowSize, trim = true }) {
  const scratch = `${output}.raw.png`
  run(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--default-background-color=00000000',
    `--window-size=${windowSize}`,
    `--screenshot=${scratch}`,
    `file://${source}`
  ])
  run(magick, trim ? [scratch, '-trim', '+repage', output] : [scratch, output])
  rmSync(scratch, { force: true })
}

shoot(join(brandDir, 'wordmark.html'), join(brandDir, 'wordmark.png'), {
  window: '1400,500'
})
console.log('✓ brand/wordmark.png')

shoot(join(brandDir, 'concepts', 'concepts.html'), join(brandDir, 'concepts', 'concepts.png'), {
  window: '1580,1010',
  trim: false
})
console.log('✓ brand/concepts/concepts.png')
