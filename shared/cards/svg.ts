// SVG renderer for previews. Text is drawn as glyph outlines from the same
// fonts and positions the PDF uses, so the preview matches the PDF without
// depending on the browser's font loading or text layout.

import { FAKE_BOLD_STROKE, ITALIC_SLANT, MM_PER_PT } from './design.ts'
import { roundedRectPath } from './paths.ts'
import type { Box, DrawOp } from './layout.ts'
import type { TextEngine } from './text.ts'

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const n = (v: number) => Math.round(v * 1000) / 1000

function rectPath(box: Box, radius: number): string {
  return roundedRectPath(box.w, box.h, radius)
}

let clipCounter = 0

export interface SvgOptions {
  /** URL for each design image id. */
  imageHref: (imageId: string) => string | undefined
  /** Extra attributes for the root element (e.g. `class="..."`). */
  attrs?: string
  /** Rendered width; defaults to `${width}mm`. */
  pixelWidth?: number
}

/** Renders ops as a standalone SVG of `width` x `height` mm. */
export function renderSvg(
  ops: DrawOp[],
  width: number,
  height: number,
  engine: TextEngine,
  options: SvgOptions
): string {
  const body = renderSvgBody(ops, engine, options)
  const size = options.pixelWidth
    ? `width="${n(options.pixelWidth)}" height="${n((options.pixelWidth * height) / width)}"`
    : `width="${n(width)}mm" height="${n(height)}mm"`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" ${size} ${options.attrs ?? ''}>${body}</svg>`
}

/** SVG elements for ops (no root), for composing sheets. */
export function renderSvgBody(ops: DrawOp[], engine: TextEngine, options: SvgOptions): string {
  let out = ''
  for (const op of ops) {
    switch (op.op) {
      case 'rect': {
        const fill = op.fill && op.fill !== 'transparent' ? escapeAttr(op.fill) : 'none'
        const stroke =
          op.stroke && op.strokeWidth && op.strokeWidth > 0
            ? ` stroke="${escapeAttr(op.stroke)}" stroke-width="${n(op.strokeWidth)}"`
            : ''
        if (fill === 'none' && !stroke) break
        if (op.radius && op.radius > 0)
          out += `<path transform="translate(${n(op.x)} ${n(op.y)})" d="${rectPath(op, op.radius)}" fill="${fill}"${stroke}/>`
        else
          out += `<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" fill="${fill}"${stroke}/>`
        break
      }
      case 'line':
        if (op.width > 0)
          out += `<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}" stroke="${escapeAttr(op.color)}" stroke-width="${n(op.width)}"/>`
        break
      case 'text': {
        let d = ''
        const slant = op.italic ? ITALIC_SLANT : 0
        for (const run of op.runs) {
          const shaped = engine.shape(run.text, run.fontId, op.size)
          d += engine.svgPath(shaped, op.x + run.dx, op.y, slant)
        }
        if (!d) break
        const color = escapeAttr(op.color)
        // Round joins, or corners such as those of A, M or V grow spikes.
        const outline = op.fakeBold
          ? ` stroke="${color}" stroke-width="${n(FAKE_BOLD_STROKE * op.size * MM_PER_PT)}" stroke-linejoin="round"`
          : ''
        out += `<path d="${d}" fill="${color}"${outline}/>`
        break
      }
      case 'image': {
        const href = options.imageHref(op.imageId)
        if (!href) break
        let clipAttr = ''
        if (op.clip) {
          const id = `bc${++clipCounter}`
          out += `<clipPath id="${id}"><path transform="translate(${n(op.clip.x)} ${n(op.clip.y)})" d="${rectPath(op.clip, op.clip.radius)}"/></clipPath>`
          clipAttr = ` clip-path="url(#${id})"`
        }
        out += `<image href="${escapeAttr(href)}" x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" preserveAspectRatio="none"${clipAttr}/>`
        break
      }
    }
  }
  return out
}
