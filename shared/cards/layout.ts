// Turns a design and a card into a display list: rectangles, lines, text and
// images in millimetres, origin at the card's top-left corner. The SVG
// preview and the PDF renderer both draw this same list.

import {
  FAKE_BOLD_STROKE,
  ITALIC_SLANT,
  MM_PER_PT,
  slotTextFont,
  type BandDesign,
  type CardDesign,
  type SlotContent,
  type TextStyle,
} from './design.ts'
import { EMPTY, FREE, type CardCells, type GridSpec } from './grid.ts'
import type { TextEngine } from './text.ts'

export interface TextRunOp {
  fontId: string
  text: string
  /** Offset from the op's x, mm. */
  dx: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type DrawOp =
  | {
      op: 'rect'
      x: number
      y: number
      w: number
      h: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      radius?: number
    }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | {
      op: 'text'
      /** Start of the text. */
      x: number
      /** Baseline. */
      y: number
      /** Points. */
      size: number
      color: string
      runs: TextRunOp[]
      /** Synthetic italic: glyphs slanted by ITALIC_SLANT around the baseline. */
      italic?: boolean
      /** Synthetic bold: glyphs outlined in their colour (FAKE_BOLD_STROKE of the size). */
      fakeBold?: boolean
    }
  | {
      op: 'image'
      imageId: string
      x: number
      y: number
      w: number
      h: number
      clip?: Box & { radius: number }
    }

const SLOT_GAP = 1

function textOp(
  engine: TextEngine,
  text: string,
  style: TextStyle,
  size: number,
  x: number,
  baseline: number,
  effects: { italic?: boolean; fakeBold?: boolean } = {}
): DrawOp {
  const shaped = engine.shape(text, style.font, size)
  return {
    op: 'text',
    x,
    y: baseline,
    size,
    color: style.color,
    runs: shaped.runs.map((r) => ({ fontId: r.fontId, text: r.text, dx: r.dx })),
    ...(effects.italic ? { italic: true } : {}),
    ...(effects.fakeBold ? { fakeBold: true } : {}),
  }
}

function imageAspect(design: CardDesign, imageId: string): number | null {
  const img = design.images[imageId]
  if (!img || !img.width || !img.height) return null
  return img.width / img.height
}

/** Largest box with the image's aspect ratio inside `box`, centred. */
export function containBox(aspect: number, box: Box): Box {
  let w = box.w
  let h = w / aspect
  if (h > box.h) {
    h = box.h
    w = h * aspect
  }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** Smallest box with the image's aspect ratio covering `box`, centred. */
export function coverBox(aspect: number, box: Box): Box {
  let w = box.w
  let h = w / aspect
  if (h < box.h) {
    h = box.h
    w = h * aspect
  }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

function cardFrame(design: CardDesign, fill: string): DrawOp[] {
  const ops: DrawOp[] = [
    {
      op: 'rect',
      x: 0,
      y: 0,
      w: design.width,
      h: design.height,
      fill,
      radius: design.borderRadius,
    },
  ]
  return ops
}

function cardBorder(design: CardDesign): DrawOp[] {
  const bw = design.borderWidth
  if (bw <= 0) return []
  return [
    {
      op: 'rect',
      x: bw / 2,
      y: bw / 2,
      w: design.width - bw,
      h: design.height - bw,
      stroke: design.borderColor,
      strokeWidth: bw,
      radius: Math.max(0, design.borderRadius - bw / 2),
    },
  ]
}

interface SlotPlan {
  slot: SlotContent
  width: number
  draw: (x: number, maxWidth: number) => DrawOp[]
}

function planSlot(
  design: CardDesign,
  engine: TextEngine,
  band: BandDesign,
  box: Box,
  slot: SlotContent,
  code: string
): SlotPlan | null {
  if (slot.type === 'none') return null
  if (slot.type === 'image') {
    const aspect = imageAspect(design, slot.imageId)
    if (!aspect) return null
    return {
      slot,
      width: box.h * aspect,
      draw: (x, maxWidth) => {
        const w = Math.min(box.h * aspect, maxWidth)
        const h = w / aspect
        return [{ op: 'image', imageId: slot.imageId, x, y: box.y + (box.h - h) / 2, w, h }]
      },
    }
  }
  const text = slot.type === 'code' ? code : slot.text
  if (!text.trim()) return null
  const { fontId, fakeBold } = slotTextFont(band, slot)
  const italic = slot.type === 'text' && !!slot.italic
  const style: TextStyle = { ...band.style, font: fontId }
  const shaped = engine.shape(text, fontId, style.size)
  // Shrink text that is taller than the band.
  const heightLimit = shaped.capHeight > 0 ? (box.h * 0.8) / shaped.capHeight : 1
  const baseSize = style.size * Math.min(1, heightLimit)
  // Room for what the effects add beyond the advance width: the outline on
  // both sides and the slant of the tallest letters.
  const stroke = fakeBold ? FAKE_BOLD_STROKE * style.size * MM_PER_PT : 0
  const extra = stroke + (italic ? shaped.capHeight * ITALIC_SLANT : 0)
  const naturalWidth = (shaped.width + extra) * (baseSize / style.size)
  return {
    slot,
    width: naturalWidth,
    draw: (x, maxWidth) => {
      const factor = naturalWidth > maxWidth ? maxWidth / naturalWidth : 1
      const size = baseSize * factor
      const ratio = size / style.size
      const capHeight = shaped.capHeight * ratio
      const baseline = box.y + box.h / 2 + capHeight / 2
      return [
        textOp(engine, text, style, size, x + (stroke / 2) * ratio, baseline, { italic, fakeBold }),
      ]
    },
  }
}

function layoutBand(
  design: CardDesign,
  engine: TextEngine,
  band: BandDesign,
  box: Box,
  code: string
): DrawOp[] {
  if (band.height <= 0) return []
  const left = planSlot(design, engine, band, box, band.left, code)
  const center = planSlot(design, engine, band, box, band.center, code)
  const right = planSlot(design, engine, band, box, band.right, code)
  const ops: DrawOp[] = []
  let sideMax = box.w
  if (center) {
    const w = Math.min(center.width, box.w)
    ops.push(...center.draw(box.x + (box.w - w) / 2, w))
    sideMax = Math.max(0, (box.w - w) / 2 - SLOT_GAP)
  } else if (left && right) {
    sideMax = box.w / 2 - SLOT_GAP / 2
  }
  if (left) ops.push(...left.draw(box.x, Math.min(left.width, sideMax)))
  if (right) {
    const w = Math.min(right.width, sideMax)
    ops.push(...right.draw(box.x + box.w - w, w))
  }
  return ops
}

export interface FrontGeometry {
  header: Box | null
  footer: Box | null
  grid: Box
  cellW: number
  cellH: number
}

export function frontGeometry(design: CardDesign, spec: GridSpec): FrontGeometry {
  const p = design.padding
  const content: Box = { x: p, y: p, w: design.width - 2 * p, h: design.height - 2 * p }
  const header =
    design.header.height > 0
      ? { x: content.x, y: content.y, w: content.w, h: design.header.height }
      : null
  const footer =
    design.footer.height > 0
      ? {
          x: content.x,
          y: content.y + content.h - design.footer.height,
          w: content.w,
          h: design.footer.height,
        }
      : null
  const top = header ? header.y + header.h + design.spacing : content.y
  const bottom = footer ? footer.y - design.spacing : content.y + content.h
  let grid: Box = { x: content.x, y: top, w: content.w, h: Math.max(0, bottom - top) }
  let cellW = grid.w / spec.cols
  let cellH = grid.h / spec.rows
  if (design.grid.squareCells) {
    const cell = Math.min(cellW, cellH)
    cellW = cellH = cell
    const w = cell * spec.cols
    const h = cell * spec.rows
    grid = { x: grid.x + (grid.w - w) / 2, y: grid.y + (grid.h - h) / 2, w, h }
  }
  return { header, footer, grid, cellW, cellH }
}

/**
 * One font size for every label of the set, so all cards look alike: the
 * largest size (up to maxFontSize) at which the widest/tallest label still
 * fits its cell.
 */
export function gridFontSize(
  design: CardDesign,
  spec: GridSpec,
  labels: string[],
  engine: TextEngine
): number {
  const { cellW, cellH } = frontGeometry(design, spec)
  const fill = Math.min(0.95, Math.max(0.3, design.grid.fill))
  const maxW = cellW * fill
  const maxH = cellH * fill
  const max = design.grid.maxFontSize
  let size = max
  for (const label of labels) {
    if (!label) continue
    const shaped = engine.shape(label, design.grid.font, max)
    const w = shaped.ink ? shaped.ink.x2 - shaped.ink.x1 : shaped.width
    const h = shaped.ink ? shaped.ink.y2 - shaped.ink.y1 : shaped.capHeight
    if (w > 0) size = Math.min(size, max * (maxW / w))
    // Cap-height based limit so tall symbols (∫, ↓) do not shrink every label.
    if (h > 0) size = Math.min(size, max * (maxH / Math.max(h, shaped.capHeight)))
  }
  return Math.max(2, size)
}

/**
 * Text centred inside `box`: horizontally on its ink, vertically on the cap
 * height when it reads like text (so `Ag` and `Ar` share a baseline), or on
 * its ink for marks that float (`°`, `′`, `−`).
 */
function centredText(
  engine: TextEngine,
  text: string,
  style: TextStyle,
  size: number,
  box: Box
): DrawOp {
  const shaped = engine.shape(text, style.font, size)
  const cap = shaped.capHeight
  const ink = shaped.ink ?? { x1: 0, x2: shaped.width, y1: -cap, y2: 0 }
  const textLike = ink.y1 <= -0.5 * cap && ink.y2 >= -0.1 * cap
  const top = textLike ? -cap : ink.y1
  const bottom = textLike ? 0 : ink.y2
  const x = box.x + box.w / 2 - (ink.x1 + ink.x2) / 2
  const baseline = box.y + box.h / 2 - (top + bottom) / 2
  return {
    op: 'text',
    x,
    y: baseline,
    size,
    color: style.color,
    runs: shaped.runs.map((r) => ({ fontId: r.fontId, text: r.text, dx: r.dx })),
  }
}

export interface FrontInput {
  design: CardDesign
  spec: GridSpec
  cells: CardCells
  /** Label of each item index. */
  labels: ReadonlyMap<number, string>
  code: string
  /** From gridFontSize. */
  fontSize: number
}

export function layoutFront(input: FrontInput, engine: TextEngine): DrawOp[] {
  const { design, spec, cells, labels, code, fontSize } = input
  const g = design.grid
  const geo = frontGeometry(design, spec)
  const ops: DrawOp[] = cardFrame(design, design.background)

  if (geo.header) ops.push(...layoutBand(design, engine, design.header, geo.header, code))
  if (geo.footer) ops.push(...layoutBand(design, engine, design.footer, geo.footer, code))

  const { grid, cellW, cellH } = geo
  if (grid.w > 0 && grid.h > 0) {
    ops.push({ op: 'rect', ...grid, fill: g.emptyColor })
    const textStyle: TextStyle = { font: g.font, size: fontSize, color: g.textColor }
    const texts: DrawOp[] = []
    cells.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value === EMPTY) return
        const cell: Box = { x: grid.x + c * cellW, y: grid.y + r * cellH, w: cellW, h: cellH }
        if (value === FREE) {
          ops.push({ op: 'rect', ...cell, fill: g.freeColor })
          const aspect = g.freeImageId ? imageAspect(design, g.freeImageId) : null
          if (g.freeImageId && aspect) {
            const inner: Box = {
              x: cell.x + cell.w * 0.12,
              y: cell.y + cell.h * 0.12,
              w: cell.w * 0.76,
              h: cell.h * 0.76,
            }
            texts.push({ op: 'image', imageId: g.freeImageId, ...containBox(aspect, inner) })
          } else if (g.freeText.trim()) {
            const style: TextStyle = { font: g.font, size: fontSize, color: g.freeTextColor }
            const shaped = engine.shape(g.freeText, g.font, fontSize)
            const w = shaped.ink ? shaped.ink.x2 - shaped.ink.x1 : shaped.width
            const size = w > cellW * 0.8 ? fontSize * ((cellW * 0.8) / w) : fontSize
            texts.push(centredText(engine, g.freeText, style, size, cell))
          }
          return
        }
        ops.push({ op: 'rect', ...cell, fill: g.filledColor })
        const label = labels.get(value)
        if (label) texts.push(centredText(engine, label, textStyle, fontSize, cell))
      })
    )
    if (g.lineWidth > 0) {
      for (let c = 1; c < spec.cols; c++) {
        const x = grid.x + c * cellW
        ops.push({
          op: 'line',
          x1: x,
          y1: grid.y,
          x2: x,
          y2: grid.y + grid.h,
          color: g.lineColor,
          width: g.lineWidth,
        })
      }
      for (let r = 1; r < spec.rows; r++) {
        const y = grid.y + r * cellH
        ops.push({
          op: 'line',
          x1: grid.x,
          y1: y,
          x2: grid.x + grid.w,
          y2: y,
          color: g.lineColor,
          width: g.lineWidth,
        })
      }
    }
    if (g.outerLineWidth > 0)
      ops.push({ op: 'rect', ...grid, stroke: g.lineColor, strokeWidth: g.outerLineWidth })
    ops.push(...texts)
  }

  ops.push(...cardBorder(design))
  return ops
}

export function layoutBack(design: CardDesign, code: string, engine: TextEngine): DrawOp[] {
  const b = design.back
  const ops: DrawOp[] = cardFrame(design, b.background)
  const card: Box = { x: 0, y: 0, w: design.width, h: design.height }
  const p = design.padding
  const content: Box = { x: p, y: p, w: design.width - 2 * p, h: design.height - 2 * p }

  const bgAspect = b.imageId ? imageAspect(design, b.imageId) : null
  if (b.imageId && bgAspect) {
    if (b.imageFit === 'cover')
      ops.push({
        op: 'image',
        imageId: b.imageId,
        ...coverBox(bgAspect, card),
        clip: { ...card, radius: design.borderRadius },
      })
    else ops.push({ op: 'image', imageId: b.imageId, ...containBox(bgAspect, content) })
  }

  // Logo, title and text stacked and centred as one block.
  const gap = 2
  const blocks: { h: number; draw: (y: number) => DrawOp[] }[] = []
  const logoAspect = b.logoId ? imageAspect(design, b.logoId) : null
  if (b.logoId && logoAspect && b.logoHeight > 0) {
    let h = design.height * Math.min(0.9, b.logoHeight)
    let w = h * logoAspect
    if (w > content.w * 0.85) {
      w = content.w * 0.85
      h = w / logoAspect
    }
    blocks.push({
      h,
      draw: (y) => [
        { op: 'image', imageId: b.logoId!, x: content.x + (content.w - w) / 2, y, w, h },
      ],
    })
  }
  if (b.title.trim()) {
    const shaped = engine.shape(b.title, b.titleStyle.font, b.titleStyle.size)
    const size =
      shaped.width > content.w ? b.titleStyle.size * (content.w / shaped.width) : b.titleStyle.size
    const cap = shaped.capHeight * (size / b.titleStyle.size)
    const width = shaped.width * (size / b.titleStyle.size)
    blocks.push({
      h: cap,
      draw: (y) => [
        textOp(engine, b.title, b.titleStyle, size, content.x + (content.w - width) / 2, y + cap),
      ],
    })
  }
  if (b.text.trim()) {
    const lines = engine.wrap(b.text, b.textStyle.font, b.textStyle.size, content.w)
    const sizeMm = (b.textStyle.size * 25.4) / 72
    const lineHeight = sizeMm * 1.3
    const cap = engine.shape('H', b.textStyle.font, b.textStyle.size).capHeight
    blocks.push({
      h: cap + lineHeight * (lines.length - 1),
      draw: (y) =>
        lines.flatMap((line, i) => {
          if (!line) return []
          const width = engine.width(line, b.textStyle.font, b.textStyle.size)
          return [
            textOp(
              engine,
              line,
              b.textStyle,
              b.textStyle.size,
              content.x + (content.w - width) / 2,
              y + cap + i * lineHeight
            ),
          ]
        }),
    })
  }
  const codeShaped =
    b.showCode && code ? engine.shape(code, b.codeStyle.font, b.codeStyle.size) : null
  if (codeShaped && b.codePosition === 'below')
    blocks.push({
      h: codeShaped.capHeight,
      draw: (y) => [
        textOp(
          engine,
          code,
          b.codeStyle,
          b.codeStyle.size,
          content.x + (content.w - codeShaped.width) / 2,
          y + codeShaped.capHeight
        ),
      ],
    })

  const total =
    blocks.reduce((sum, block) => sum + block.h, 0) + gap * Math.max(0, blocks.length - 1)
  let y = content.y + Math.max(0, (content.h - total) / 2)
  for (const block of blocks) {
    ops.push(...block.draw(y))
    y += block.h + gap
  }

  if (codeShaped && b.codePosition !== 'below') {
    const [vertical, horizontal] = b.codePosition.split('-') as ['top' | 'bottom', string]
    const x =
      horizontal === 'left'
        ? content.x
        : horizontal === 'center'
          ? content.x + (content.w - codeShaped.width) / 2
          : content.x + content.w - codeShaped.width
    const baseline = vertical === 'top' ? content.y + codeShaped.capHeight : content.y + content.h
    ops.push(textOp(engine, code, b.codeStyle, b.codeStyle.size, x, baseline))
  }

  ops.push(...cardBorder(design))
  return ops
}

/** Font ids a display list draws with (after fallbacks). */
export function opFontIds(ops: DrawOp[]): Set<string> {
  const ids = new Set<string>()
  for (const op of ops) if (op.op === 'text') for (const run of op.runs) ids.add(run.fontId)
  return ids
}
