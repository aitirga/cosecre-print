# Cosecre-print brand assets

The mark is **Aperture**: a bold `C` whose opening *is* the paper slot, with a sheet coming
through it. It carries the Cosecre initial and stays legible down to 16 px, which is the size
that actually decides an app icon.

## Files

| File | Role |
|---|---|
| `icon.svg` | **Source of truth** for the app icon. 512-unit coordinate system, dark rounded tile baked in. |
| `mark.svg` | The same mark without the tile, transparent — for surfaces that have their own background. |
| `wordmark.html` | Source for the README banner. |
| `wordmark.png` | Generated banner. Committed. |
| `build-icons.mjs` | Regenerates the two derived assets. |
| `concepts/` | The three concepts that were considered, rendered at 64/32/16 px. Kept as a record of why this one won. |
| `../build/icon.png` | Generated 1024×1024 master. electron-builder turns it into the `.icns` and `.ico` at package time. Committed. |

There is a third copy of the mark in [`src/renderer/src/components/logo.tsx`](../src/renderer/src/components/logo.tsx),
as a React component for the app's own title bar. Keep it in sync with `mark.svg`.

## Regenerating

```bash
npm run brand
```

Needs `librsvg` and ImageMagick, plus Chrome for the wordmark:

```bash
brew install librsvg imagemagick
```

The generated files are **committed on purpose**. Packaging runs in CI on runners that have
none of those tools, so the build must never depend on this script having run — it is a local
authoring convenience only.

## Changing the mark

Edit `icon.svg`, run `npm run brand`, and mirror the change into `mark.svg`,
`wordmark.html` and `logo.tsx`. Switching wholesale to one of the other concepts in
`concepts/` means lifting that `<symbol>` body out of `concepts/concepts.html`.

## Palette

Taken from the app's own theme in [`src/renderer/src/styles.css`](../src/renderer/src/styles.css) —
the icon and the UI are deliberately the same blue.

| Token | Hex | Use |
|---|---|---|
| accent | `#4f8ef7` | the `C`; flat accent |
| accent gradient | `#6ba2ff` → `#2f6fdd` | the `C` in the icon |
| paper | `#ffffff` → `#d7e0f2` | the sheet |
| ink-900 | `#0b0d12` | app background; the sheet's text lines |
| tile | `#1b2130` → `#0a0c11` | icon tile |

## Rules

- **No hairlines.** Every stroke is ≥ 13 units in the 512 grid, so nothing disappears when
  macOS downsamples 1024 px to 16 px.
- **The sheet must clear the arc's ends.** The `C`'s stroke ends occupy y 123–185 and
  y 327–389; the sheet sits at y 214–298 so the letter never looks broken.
- **Butt caps on the arc, not round.** The flat ends are what make the gap read as a paper
  slot instead of an incomplete circle.
- **Text lines are left-aligned and unequal.** Centred equal-length lines read as an `=` sign.
