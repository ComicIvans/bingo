// PDF renderer: draws display lists with pdf-lib, embedding (and subsetting)
// only the fonts the cards use. Runs in a Web Worker in the browser, and in
// Node for the tests.

import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type Color,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { PT_PER_MM, type CardDesign } from './design.ts'
import { roundedRectPath } from './paths.ts'
import type { GeneratedCard, GridSpec } from './grid.ts'
import { computeImposition, cropMarks, planPages, type SheetOptions } from './impose.ts'
import { gridFontSize, layoutBack, layoutFront, type DrawOp } from './layout.ts'
import type { TextEngine } from './text.ts'

export interface PdfImageAsset {
  bytes: Uint8Array
  type: 'png' | 'jpg'
}

export interface PdfJob {
  design: CardDesign
  spec: GridSpec
  cards: GeneratedCard[]
  /** Card code of each card, same order as `cards`. */
  codes: string[]
  /** [index, label] of every item in the set. */
  labels: [number, string][]
  sheet: SheetOptions
  title?: string
}

export interface PdfAssets {
  /** Font bytes by font id (bundled ids and `custom:<id>`). */
  fonts: ReadonlyMap<string, Uint8Array>
  /** Raster images by design image id (SVGs are rasterised beforehand). */
  images: ReadonlyMap<string, PdfImageAsset>
}

export interface PdfOptions {
  /**
   * Subset embedded fonts. Off by default: pdf-lib's subsetter breaks composite
   * glyphs (Noto Sans Bold Greek, Noto Sans Math), leaving blank cells.
   */
  subset?: boolean
  onProgress?: (done: number, total: number) => void
}

export function parseColor(value: string | undefined): Color | undefined {
  if (!value || value === 'transparent') return undefined
  let hex = value.trim().replace(/^#/, '')
  if (hex.length === 3 || hex.length === 4)
    hex = hex
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-f]{6}/i.test(hex)) return undefined
  const n = parseInt(hex.slice(0, 6), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

class PdfPainter {
  private fonts = new Map<string, PDFFont>()
  private images = new Map<string, PDFImage>()
  private readonly doc: PDFDocument
  private readonly assets: PdfAssets
  private readonly subset: boolean

  constructor(doc: PDFDocument, assets: PdfAssets, subset: boolean) {
    this.doc = doc
    this.assets = assets
    this.subset = subset
  }

  private async font(id: string): Promise<PDFFont | undefined> {
    if (this.fonts.has(id)) return this.fonts.get(id)
    const bytes = this.assets.fonts.get(id)
    if (!bytes) return undefined
    const font = await this.doc.embedFont(bytes, { subset: this.subset })
    this.fonts.set(id, font)
    return font
  }

  private async image(id: string): Promise<PDFImage | undefined> {
    if (this.images.has(id)) return this.images.get(id)
    const asset = this.assets.images.get(id)
    if (!asset) return undefined
    const image =
      asset.type === 'png'
        ? await this.doc.embedPng(asset.bytes)
        : await this.doc.embedJpg(asset.bytes)
    this.images.set(id, image)
    return image
  }

  /** Draws ops with the card's top-left corner at (ox, oy) mm. */
  async draw(page: PDFPage, ops: DrawOp[], ox: number, oy: number) {
    const pageH = page.getHeight()
    const X = (v: number) => (ox + v) * PT_PER_MM
    const Y = (v: number) => pageH - (oy + v) * PT_PER_MM

    for (const op of ops) {
      switch (op.op) {
        case 'rect': {
          const fill = parseColor(op.fill)
          const stroke = op.strokeWidth && op.strokeWidth > 0 ? parseColor(op.stroke) : undefined
          if (!fill && !stroke) break
          if (op.radius && op.radius > 0) {
            page.drawSvgPath(roundedRectPath(op.w, op.h, op.radius), {
              x: X(op.x),
              y: Y(op.y),
              scale: PT_PER_MM,
              ...(fill ? { color: fill } : {}),
              ...(stroke ? { borderColor: stroke, borderWidth: op.strokeWidth } : {}),
            })
          } else {
            page.drawRectangle({
              x: X(op.x),
              y: Y(op.y + op.h),
              width: op.w * PT_PER_MM,
              height: op.h * PT_PER_MM,
              ...(fill ? { color: fill } : {}),
              ...(stroke ? { borderColor: stroke, borderWidth: op.strokeWidth! * PT_PER_MM } : {}),
            })
          }
          break
        }
        case 'line': {
          const color = parseColor(op.color)
          if (!color || op.width <= 0) break
          page.drawLine({
            start: { x: X(op.x1), y: Y(op.y1) },
            end: { x: X(op.x2), y: Y(op.y2) },
            thickness: op.width * PT_PER_MM,
            color,
          })
          break
        }
        case 'text': {
          const color = parseColor(op.color) ?? rgb(0, 0, 0)
          for (const run of op.runs) {
            const font = await this.font(run.fontId)
            if (!font) continue
            page.drawText(run.text, { x: X(op.x + run.dx), y: Y(op.y), size: op.size, font, color })
          }
          break
        }
        case 'image': {
          const image = await this.image(op.imageId)
          if (!image) break
          if (op.clip) {
            const c = op.clip
            page.pushOperators(
              pushGraphicsState(),
              ...clipPath(X(c.x), Y(c.y), c.w * PT_PER_MM, c.h * PT_PER_MM, c.radius * PT_PER_MM),
              clip(),
              endPath()
            )
          }
          page.drawImage(image, {
            x: X(op.x),
            y: Y(op.y + op.h),
            width: op.w * PT_PER_MM,
            height: op.h * PT_PER_MM,
          })
          if (op.clip) page.pushOperators(popGraphicsState())
          break
        }
      }
    }
  }
}

/** Rounded-rectangle path operators; (x, top) in PDF points. */
function clipPath(x: number, top: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2)
  const b = top - h
  if (k <= 0)
    return [moveTo(x, b), lineTo(x + w, b), lineTo(x + w, top), lineTo(x, top), closePath()]
  const c = k * 0.5523
  return [
    moveTo(x + k, b),
    lineTo(x + w - k, b),
    appendBezierCurve(x + w - k + c, b, x + w, b + k - c, x + w, b + k),
    lineTo(x + w, top - k),
    appendBezierCurve(x + w, top - k + c, x + w - k + c, top, x + w - k, top),
    lineTo(x + k, top),
    appendBezierCurve(x + k - c, top, x, top - k + c, x, top - k),
    lineTo(x, b + k),
    appendBezierCurve(x, b + k - c, x + k - c, b, x + k, b),
    closePath(),
  ]
}

/** Builds the whole PDF. Throws with a Spanish message when the sheet does not fit. */
export async function renderPdf(
  job: PdfJob,
  assets: PdfAssets,
  engine: TextEngine,
  options: PdfOptions = {}
): Promise<Uint8Array> {
  const { design, spec, cards, codes, sheet } = job
  const imp = computeImposition(design.width, design.height, sheet)
  if ('error' in imp) throw new Error(imp.error)

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(job.title ?? 'Cartones de bingo')
  doc.setCreator('Bingo (GPL-3.0)')
  doc.setProducer('pdf-lib')

  const painter = new PdfPainter(doc, assets, options.subset ?? false)
  const labels = new Map(job.labels)
  const fontSize = gridFontSize(design, spec, [...labels.values()], engine)
  const withBacks = design.back.enabled
  const pages = planPages(cards.length, imp, withBacks)
  const marks =
    sheet.mode === 'sheet' && sheet.cropMarks
      ? cropMarks(imp, design.width, design.height, sheet.gap)
      : []
  // The back is the same for every card unless it shows the code.
  const sharedBack = withBacks && !design.back.showCode ? layoutBack(design, '', engine) : null

  let done = 0
  for (const plan of pages) {
    const page = doc.addPage([imp.pageWidth * PT_PER_MM, imp.pageHeight * PT_PER_MM])
    for (const { card, slot } of plan.cards) {
      const ops =
        plan.side === 'front'
          ? layoutFront(
              {
                design,
                spec,
                cells: cards[card]!.cells,
                labels,
                code: codes[card] ?? '',
                fontSize,
              },
              engine
            )
          : (sharedBack ?? layoutBack(design, codes[card] ?? '', engine))
      await painter.draw(page, ops, slot.x, slot.y)
    }
    if (plan.side === 'front' && marks.length)
      await painter.draw(
        page,
        marks.map((m) => ({ op: 'line', ...m, color: '#000000', width: 0.1 }) as DrawOp),
        0,
        0
      )
    done++
    options.onProgress?.(done, pages.length)
  }
  return doc.save()
}
