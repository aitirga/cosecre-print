# Cosecre-print

A local desktop app for printing batches of PDF and Word documents **concurrently**, with live
job tracking and a persistent print history.

Drop in a pile of mixed PDF/DOCX files, preview them, send each to whichever printer you want,
and watch every job progress independently.

## Features

- **Drag and drop** PDF and Word (`.docx`) files anywhere in the window, or use the file picker.
- **Accurate preview** — Word files are converted to PDF with LibreOffice first, so what you see
  is byte-for-byte what gets printed. Page navigation and zoom included.
- **Real concurrency** — conversions run in parallel, and jobs on *different* printers print at
  the same time. Jobs on the *same* printer queue up, because a printer is a serial device.
- **Live tracking** — every job moves through `queued → converting → ready → sending → in queue
  → printing → done`, driven by the actual print spooler rather than a guess.
- **Per-document settings** — printer, copies, page range, duplex, colour, paper size, with an
  "apply to all" shortcut.
- **History** — every finished job is recorded with printer, settings, duration and outcome;
  searchable and filterable.

## Requirements

- **Node.js 20+** for development.
- **LibreOffice** — required only for Word documents. It is auto-detected in the usual install
  locations; if yours lives somewhere unusual, set the path to `soffice` in Settings. PDFs work
  without it.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

If Electron reports `Electron uninstall` on first run, its binary did not download during
install. Fix it with:

```bash
node node_modules/electron/install.js
```

## Building

```bash
npm run build:mac
```

```bash
npm run build:win
```

Installers land in `release/`. Builds are **unsigned** — macOS will need Gatekeeper approval on
first launch, and Windows will show a SmartScreen warning.

Note that `build:win` must run **on Windows** (or in CI on a Windows runner). electron-builder
cannot reliably produce the NSIS installer from macOS.

## How it works

```
.pdf  ─────────────────────────────────────────────┐
                                                   ├──▶ printable PDF ──▶ preview + print
.docx ──▶ LibreOffice headless --convert-to pdf ───┘
```

Everything becomes a PDF before it is previewed or printed. That gives one preview renderer, one
print path, and a preview that cannot drift from the printed output.

### Printing

| Platform | Submission | Tracking |
|---|---|---|
| macOS / Linux | `lp` (CUPS) | `lpstat` polling with the real CUPS job id |
| Windows | `pdf-to-printer` (SumatraPDF engine) | `Get-PrintJob`, matched on document name |

Both use the same `PrintDriver` interface (`src/main/printing/driver.ts`), and neither needs a
native module — the whole app compiles without `electron-rebuild`, which is what keeps
cross-platform packaging simple.

`lp` is invoked with an explicit argv array rather than a shell string, so filenames containing
spaces or apostrophes (`John's report.pdf`) print correctly.

### Concurrency

Two independent pools:

- **Conversions** — a `p-queue` with configurable concurrency. Each concurrent LibreOffice
  process gets its **own profile directory** via `-env:UserInstallation`. This is not optional:
  LibreOffice is not thread-safe, and instances sharing a profile silently drop conversions.
  Measured on this repo's test batch, 4 files with a shared profile produced **1** PDF; with
  isolated profiles, **4**.
- **Submissions** — one serial queue per printer, all running side by side.

### Storage

Settings and history are plain JSON under Electron's `userData` directory, written atomically
(temp file + rename) so a crash mid-write cannot corrupt them.

- macOS: `~/Library/Application Support/Cosecre-print/`
- Windows: `%APPDATA%/Cosecre-print/`

## Known limitations

- **Windows job tracking is best-effort.** The Windows print engine does not return a spooler
  job id, so jobs are matched by document name and can collide when two files share a name.
  Those jobs are labelled `submitted-only` in the UI rather than claiming a fidelity the
  platform does not provide. The Windows driver has **not been tested on Windows hardware**.
- **A job cancelled outside the app** (e.g. via `cancel` or Print Center) is reported as "Done",
  because completion is inferred from the job leaving the spooler queue.
- Only `.pdf` and `.docx` are supported. Legacy `.doc` and image files are rejected.

## Project layout

```
src/
├── shared/          # types + IPC channel names, shared by all three processes
├── main/
│   ├── printing/    # PrintDriver interface + unix/windows implementations
│   ├── convert/     # LibreOffice discovery, conversion, profile-isolated pool
│   ├── queue/       # job model, state machine, scheduler, spooler polling
│   └── store/       # atomic JSON settings + history
├── preload/         # contextBridge API (`window.cosecrePrint`)
└── renderer/        # React UI
```
