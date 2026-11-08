// Renders sample PDFs with the real card engine and rasterises their pages to
// PNG (tests/output), to check by eye that cards come out right.
// Usage: node scripts/render-sample.ts

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import * as mupdf from 'mupdf'
import { BUILTIN_SETS } from '../shared/data/builtin-sets.ts'
import { FALLBACK_FONT_IDS, FALLBACK_FONT_IDS_BOLD, FONTS } from '../shared/fonts.ts'
import { defaultDesign, type CardDesign } from '../shared/cards/design.ts'
import {
  ENGINE_VERSION,
  cardCode,
  generateBatch,
  gridSpecFor,
  type CardFormat,
} from '../shared/cards/grid.ts'
import { DEFAULT_SHEET, type SheetOptions } from '../shared/cards/impose.ts'
import { renderPdf, type PdfImageAsset } from '../shared/cards/pdf.ts'
import { TextEngine, fontWeight } from '../shared/cards/text.ts'
import { gridFontSize, layoutFront } from '../shared/cards/layout.ts'
import { renderSvg } from '../shared/cards/svg.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'tests', 'output')
mkdirSync(out, { recursive: true })

const fontBytes = new Map<string, Uint8Array>()
const fontObjs = new Map<string, ReturnType<typeof fontkit.create>>()
for (const f of FONTS) {
  const bytes = new Uint8Array(readFileSync(join(root, 'public', 'fonts', `${f.id}.ttf`)))
  fontBytes.set(f.id, bytes)
  fontObjs.set(f.id, fontkit.create(bytes))
}
const engine = new TextEngine(fontObjs, (primary) =>
  fontWeight(primary) >= 600 ? FALLBACK_FONT_IDS_BOLD : FALLBACK_FONT_IDS
)

const logoPng = join(out, 'logo.png')
const images = new Map<string, PdfImageAsset>()
if (existsSync(logoPng))
  images.set('logo', { bytes: new Uint8Array(readFileSync(logoPng)), type: 'png' })

async function sample(
  name: string,
  setId: string,
  format: CardFormat,
  design: CardDesign,
  sheet: SheetOptions,
  count: number
) {
  const set = BUILTIN_SETS.find((s) => s.id === setId)!
  const spec = gridSpecFor(format)
  const cards = generateBatch({
    engine: ENGINE_VERSION,
    seed: `sample-${name}`,
    spec,
    indices: set.items.map((i) => i.index),
    count,
  })
  const codes = cards.map((c) => cardCode('K3F9', c.number, count))
  const labels = set.items.map((i) => [i.index, i.label] as [number, string])
  for (const subset of [false]) {
    const t = performance.now()
    const bytes = await renderPdf(
      { design, spec, cards, codes, labels, sheet },
      { fonts: fontBytes, images },
      engine,
      { subset }
    )
    const file = join(out, `${name}.pdf`)
    writeFileSync(file, bytes)
    console.log(
      `${name} subset=${subset}: ${Math.round(bytes.length / 1024)} KB in ${Math.round(performance.now() - t)} ms`
    )
  }
  const doc = mupdf.Document.openDocument(readFileSync(join(out, `${name}.pdf`)), 'application/pdf')
  const pages = Math.min(doc.countPages(), 2)
  for (let i = 0; i < pages; i++) {
    const pixmap = doc
      .loadPage(i)
      .toPixmap(mupdf.Matrix.scale(150 / 72, 150 / 72), mupdf.ColorSpace.DeviceRGB, false, true)
    writeFileSync(join(out, `${name}-p${i + 1}.png`), pixmap.asPNG())
  }
  // SVG preview of the first card, for comparison with the PDF.
  const fontSize = gridFontSize(
    design,
    spec,
    labels.map((l) => l[1]),
    engine
  )
  const ops = layoutFront(
    { design, spec, cells: cards[0]!.cells, labels: new Map(labels), code: codes[0]!, fontSize },
    engine
  )
  writeFileSync(
    join(out, `${name}-card1.svg`),
    renderSvg(ops, design.width, design.height, engine, { imageHref: () => 'logo.png' })
  )
}

const allSymbols: CardFormat = {
  kind: 'custom',
  rows: 9,
  cols: 10,
  perRow: 10,
  maxPerColumn: 9,
  columnOrder: true,
  freeCenter: false,
}
const big = { ...defaultDesign({ title: 'Todos los símbolos' }), width: 200, height: 190 }
big.grid.font = 'montserrat-700'
big.grid.maxFontSize = 30
await sample('symbols-all', 'simbolos', allSymbols, big, { ...DEFAULT_SHEET, mode: 'single' }, 1)
await sample(
  'numbers-a4',
  'numeros',
  { kind: 'classic90' },
  defaultDesign({ title: 'Bingo XXVI ENEM' }),
  DEFAULT_SHEET,
  20
)
await sample(
  'chemistry-a4',
  'tabla-periodica',
  { kind: 'classic90' },
  defaultDesign({ title: 'Bingo químico' }),
  { ...DEFAULT_SHEET, gap: 3 },
  12
)
const square = { ...defaultDesign({ title: 'BINGO', accent: '#5b3e73' }), width: 100, height: 120 }
square.header.height = 12
square.grid.squareCells = true
await sample(
  'american-a4',
  'numeros',
  { kind: 'american75', freeCenter: true },
  square,
  { ...DEFAULT_SHEET, flip: 'long' },
  6
)
console.log('Done')
