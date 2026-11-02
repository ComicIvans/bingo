// Imposition: how cards are placed on the printed pages.
//
// "sheet" mode follows the CREUP qr project: an outer margin at the page
// edges, a gap only between cards, the grid centred on the page, and for each
// sheet a page of fronts followed by a page of backs. Backs are mirrored slot
// by slot so that, printed double-sided, each back lands behind its front.
// Centring the grid is what makes the mirror exact.

export type FlipEdge = 'long' | 'short'

export interface SheetOptions {
  /** One card per page (page = card size) or several cards per sheet. */
  mode: 'single' | 'sheet'
  paperWidth: number
  paperHeight: number
  orientation: 'auto' | 'portrait' | 'landscape'
  /** Outer margin, mm. */
  margin: number
  /** Gap between cards, mm. */
  gap: number
  /**
   * Edge the printer flips the sheet on for double-sided printing. With the
   * long edge on a portrait page the backs mirror left-right; with the short
   * edge they mirror top-bottom (and the other way round on landscape pages).
   */
  flip: FlipEdge
  cropMarks: boolean
}

export interface Slot {
  x: number
  y: number
}

export interface Imposition {
  pageWidth: number
  pageHeight: number
  cols: number
  rows: number
  perPage: number
  /** Front slots in reading order (top-left origin, mm). */
  fronts: Slot[]
  /** Back slot for the card in the same position of `fronts`. */
  backs: Slot[]
  /** Card rectangle of the whole grid, for crop marks. */
  gridBox: { x: number; y: number; w: number; h: number }
}

export const DEFAULT_SHEET: SheetOptions = {
  mode: 'sheet',
  paperWidth: 210,
  paperHeight: 297,
  orientation: 'auto',
  margin: 7,
  gap: 0,
  flip: 'long',
  cropMarks: true,
}

function gridFor(
  cardW: number,
  cardH: number,
  pageW: number,
  pageH: number,
  margin: number,
  gap: number
) {
  const usableW = pageW - 2 * margin
  const usableH = pageH - 2 * margin
  if (usableW <= 0 || usableH <= 0) return { cols: 0, rows: 0 }
  // n cards take n*card + (n-1)*gap.
  const cols = Math.floor((usableW + gap + 1e-6) / (cardW + gap))
  const rows = Math.floor((usableH + gap + 1e-6) / (cardH + gap))
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) }
}

/** Returns the imposition, or an error message in Spanish. */
export function computeImposition(
  cardW: number,
  cardH: number,
  opts: SheetOptions
): Imposition | { error: string } {
  if (cardW <= 0 || cardH <= 0) return { error: 'El tamaño del cartón debe ser mayor que 0.' }

  if (opts.mode === 'single') {
    return {
      pageWidth: cardW,
      pageHeight: cardH,
      cols: 1,
      rows: 1,
      perPage: 1,
      fronts: [{ x: 0, y: 0 }],
      backs: [{ x: 0, y: 0 }],
      gridBox: { x: 0, y: 0, w: cardW, h: cardH },
    }
  }

  if (opts.margin < 0 || opts.gap < 0) return { error: 'Los márgenes no pueden ser negativos.' }
  const short = Math.min(opts.paperWidth, opts.paperHeight)
  const long = Math.max(opts.paperWidth, opts.paperHeight)
  const portrait = {
    w: short,
    h: long,
    ...gridFor(cardW, cardH, short, long, opts.margin, opts.gap),
  }
  const landscape = {
    w: long,
    h: short,
    ...gridFor(cardW, cardH, long, short, opts.margin, opts.gap),
  }
  const pick =
    opts.orientation === 'portrait'
      ? portrait
      : opts.orientation === 'landscape'
        ? landscape
        : landscape.cols * landscape.rows > portrait.cols * portrait.rows
          ? landscape
          : portrait

  const { cols, rows, w: pageWidth, h: pageHeight } = pick
  if (cols < 1 || rows < 1)
    return {
      error:
        'Con este tamaño de folio y estos márgenes no cabe ningún cartón. Reduce el margen o el tamaño del cartón, o usa un folio mayor.',
    }

  const gridW = cols * cardW + (cols - 1) * opts.gap
  const gridH = rows * cardH + (rows - 1) * opts.gap
  const offsetX = (pageWidth - gridW) / 2
  const offsetY = (pageHeight - gridH) / 2
  const isPortrait = pageHeight >= pageWidth
  // Long-edge flip on a portrait page (or short-edge on landscape) turns the
  // sheet around its vertical axis: columns mirror. Otherwise rows mirror.
  const mirrorColumns = (opts.flip === 'long') === isPortrait

  const fronts: Slot[] = []
  const backs: Slot[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      fronts.push({ x: offsetX + c * (cardW + opts.gap), y: offsetY + r * (cardH + opts.gap) })
      const br = mirrorColumns ? r : rows - 1 - r
      const bc = mirrorColumns ? cols - 1 - c : c
      backs.push({ x: offsetX + bc * (cardW + opts.gap), y: offsetY + br * (cardH + opts.gap) })
    }

  return {
    pageWidth,
    pageHeight,
    cols,
    rows,
    perPage: cols * rows,
    fronts,
    backs,
    gridBox: { x: offsetX, y: offsetY, w: gridW, h: gridH },
  }
}

export interface CropMark {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Crop marks in the outer margin, in line with every card edge. Nothing is
 * drawn when the margin is too narrow for them.
 */
export function cropMarks(imp: Imposition, cardW: number, cardH: number, gap: number): CropMark[] {
  const { x, y, w, h } = imp.gridBox
  const room = Math.min(x, y, imp.pageWidth - x - w, imp.pageHeight - y - h)
  const offset = 1
  const length = Math.min(5, room - offset - 0.5)
  if (length < 1.5) return []

  const xs = new Set<number>()
  const ys = new Set<number>()
  for (let c = 0; c < imp.cols; c++) {
    xs.add(x + c * (cardW + gap))
    xs.add(x + c * (cardW + gap) + cardW)
  }
  for (let r = 0; r < imp.rows; r++) {
    ys.add(y + r * (cardH + gap))
    ys.add(y + r * (cardH + gap) + cardH)
  }
  const marks: CropMark[] = []
  for (const mx of xs) {
    marks.push({ x1: mx, y1: y - offset - length, x2: mx, y2: y - offset })
    marks.push({ x1: mx, y1: y + h + offset, x2: mx, y2: y + h + offset + length })
  }
  for (const my of ys) {
    marks.push({ x1: x - offset - length, y1: my, x2: x - offset, y2: my })
    marks.push({ x1: x + w + offset, y1: my, x2: x + w + offset + length, y2: my })
  }
  return marks
}

/** Page sequence for `count` cards: which card goes in which slot of which page. */
export interface PagePlan {
  side: 'front' | 'back'
  /** Card positions (0-based within the batch) and their slot. */
  cards: { card: number; slot: Slot }[]
}

export function planPages(count: number, imp: Imposition, withBacks: boolean): PagePlan[] {
  const pages: PagePlan[] = []
  for (let start = 0; start < count; start += imp.perPage) {
    const cards = Array.from({ length: Math.min(imp.perPage, count - start) }, (_, i) => start + i)
    pages.push({ side: 'front', cards: cards.map((card, i) => ({ card, slot: imp.fronts[i]! })) })
    if (withBacks)
      pages.push({ side: 'back', cards: cards.map((card, i) => ({ card, slot: imp.backs[i]! })) })
  }
  return pages
}
