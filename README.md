<p align="center">
  <img src="brand/wordmark.png" alt="Cosecre-print" width="552" />
</p>

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

## Updating

The app updates itself from **GitHub Releases** — there is no server to run. electron-builder
uploads the installers plus a `latest.yml` / `latest-mac.yml` manifest to the release, and
`electron-updater` inside the app reads that manifest.

Cutting a release is a tag push:

```bash
npm version minor && git push --follow-tags
```

That fires [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds macOS,
Windows and Linux in parallel, uploads all three to a **draft** release, and then — only once every
platform has finished — publishes it. That ordering matters: a client never sees a release that is
missing its own installer, and if any platform fails the release simply stays a draft.

The tag must match the version in `package.json`, which `npm version` guarantees. That version is
what the app compares against, so a mismatched tag produces a release nobody is ever offered.

In the app, checks run 8 seconds after launch and every 6 hours after that. Settings → **Updates**
shows the running version and has a **Check now** button.

### What happens on each platform

| Platform | Behaviour |
|---|---|
| Windows | **Full auto-update.** Downloads in the background, installs on next quit — or immediately via **Restart and install**. |
| Linux | **Full auto-update**, when running as an AppImage. |
| macOS | **Check and notify.** Reports the new version and opens the release page to download the DMG. |

macOS is the odd one out, and not by choice. Squirrel.Mac reads the running bundle's designated
code requirement before replacing it, so an app that is unsigned — or only ad-hoc signed — **cannot**
update itself in place; it fails with an opaque signature error. Rather than pretend otherwise, the
app asks `codesign` what it is at startup and degrades to a download link, saying why.

Because that check happens at runtime, **enabling real macOS auto-update takes no code change**:

1. Add a Developer ID certificate as the repository secrets `MAC_CERT_P12_BASE64` (the `.p12`,
   base64-encoded) and `MAC_CERT_PASSWORD`. The workflow already reads both.
2. Delete `identity: null` from [`electron-builder.yml`](electron-builder.yml).

The app then detects the signature and switches to in-place updates on its own.

> **Unsigned macOS downloads are quarantined.** Until the app is signed *and notarised*, a DMG
> downloaded from GitHub will be refused by Gatekeeper — usually as "damaged and can't be opened".
> Clear the quarantine flag to open it:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/Cosecre-print.app
> ```

## Branding

The icon and wordmark sources live in [`brand/`](brand/), with the rationale and the rules in
[`brand/README.md`](brand/README.md). `build/icon.png` is the 1024 px master that electron-builder
turns into the `.icns` and `.ico`; regenerate it from the SVG with:

```bash
npm run brand
```

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
│   ├── store/       # atomic JSON settings + history
│   └── updater.ts   # GitHub Releases update check
├── preload/         # contextBridge API (`window.cosecrePrint`)
└── renderer/        # React UI

brand/               # icon + wordmark sources, and the concepts behind them
build/icon.png       # generated 1024px master, consumed by electron-builder
```
