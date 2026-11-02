// Rasterises PDF pages to PNG with MuPDF (WASM), to inspect generated PDFs.
// Usage: node scripts/pdf-to-png.ts <file.pdf> [dpi=150] [maxPages=2]

import { readFileSync, writeFileSync } from 'node:fs'
import * as mupdf from 'mupdf'

const [file, dpiArg, pagesArg] = process.argv.slice(2)
if (!file) {
  console.error('Usage: node scripts/pdf-to-png.ts <file.pdf> [dpi] [maxPages]')
  process.exit(1)
}
const dpi = Number(dpiArg ?? 150)
const doc = mupdf.Document.openDocument(readFileSync(file), 'application/pdf')
const pages = Math.min(doc.countPages(), Number(pagesArg ?? 2))
for (let i = 0; i < pages; i++) {
  const pixmap = doc
    .loadPage(i)
    .toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false, true)
  const target = file.replace(/\.pdf$/i, `-p${i + 1}.png`)
  writeFileSync(target, pixmap.asPNG())
  console.log(target)
}
