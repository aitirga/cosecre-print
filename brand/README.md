# Cosecre-print brand assets

The mark is **Aperture**: a bold `C` whose opening *is* the paper slot, with a sheet coming
through it. It carries the Cosecre initial and stays legible down to 16 px, which is the size
that actually decides an app icon.

## Files

| File | Role |
|---|---|
| `icon.svg` | **Source of truth** for the app icon. 512-unit coordinate system, pale blue rounded tile baked in. |
| `mark.svg` | The same mark without the tile, transparent — for surfaces that have their own background. |
| `wordmark.html` | Source for the README banner. |
| `wordmark.png` | Generated banner. Committed. |
| `build-icons.mjs` | Regenerates the three derived assets. |
| `concepts/concepts.html` | The three concepts that were considered, rendered at 64/32/16 px. Kept as a record of why this one won. |
| `concepts/concepts.png` | Generated record sheet. Committed. |
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
the icon and the UI are deliberately the same blue on the same blue-tinted white.

| Token | Hex | Use |
|---|---|---|
| accent-700 | `#2f5aa8` | the sheet's outline and text lines; accent text in the UI |
| accent-600 | `#3f6fce` | filled buttons |
| accent gradient | `#7ea8ee` → `#2f5aa8` | the `C` |
| paper | `#ffffff` → `#f2f7fe` | the sheet |
| tile | `#ffffff` → `#d7e7fa` | icon tile |
| mist-100 | `#f5f9fe` | app background |
| ink-900 | `#1b2c46` | primary text |

## Rules

- **No hairlines.** Every stroke is ≥ 13 units in the 512 grid, so nothing disappears when
  macOS downsamples 1024 px to 16 px.
- **The sheet is outlined, not plain white.** On a pale tile an unoutlined sheet dissolves into
  the background by 16 px. The 13-unit `accent-700` outline is what gives it a silhouette, and it
  is free: the sheet passes through the `C`'s gap without ever crossing the arc, so the outline
  only ever sits on tile.
- **The sheet must clear the arc's ends.** The `C`'s stroke ends occupy y 123–185 and
  y 327–389; the sheet sits at y 214–298, or 207.5–304.5 once its outline is counted, so the
  letter never looks broken.
- **Butt caps on the arc, not round.** The flat ends are what make the gap read as a paper
  slot instead of an incomplete circle.
- **Text lines are left-aligned and unequal.** Centred equal-length lines read as an `=` sign.
