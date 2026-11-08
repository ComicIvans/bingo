// Text shaping and measuring with fontkit, shared by the SVG preview and the
// PDF renderer so both place every glyph at the same spot.
//
// Positions use each glyph's advance width without kerning, because that is
// what pdf-lib writes into the PDF.

import type { Font, Glyph } from '@pdf-lib/fontkit'
import { MM_PER_PT } from './design.ts'

export interface ShapedRun {
  fontId: string
  text: string
  /** Offset from the start of the text, mm. */
  dx: number
  glyphs: Glyph[]
  /** mm per font unit at the shaped size. */
  scale: number
  /** Advance of each glyph, mm. */
  advances: number[]
  width: number
}

export interface InkBox {
  /** Relative to the text start (x) and baseline (y), y pointing down, mm. */
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ShapedText {
  runs: ShapedRun[]
  /** Advance width, mm. */
  width: number
  /** Union of the glyph outlines, or null for blank text. */
  ink: InkBox | null
  /** Cap height of the primary font, mm. */
  capHeight: number
  /** Characters no font could draw. */
  missing: string[]
}

type FontWithMetrics = Font & {
  unitsPerEm: number
  ascent: number
  descent: number
  capHeight: number
}

interface PathCommand {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'
  args: number[]
}

// Joiners, variation selectors and combining marks stay with the previous run.
function attachesToPrevious(cp: number): boolean {
  return (
    cp === 0x200c ||
    cp === 0x200d ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0x0300 && cp <= 0x036f)
  )
}

export class TextEngine {
  private readonly fonts: ReadonlyMap<string, Font>
  /** Fonts to try, in order, when `primary` lacks a glyph. */
  private readonly fallbacks: (primary: string) => string[]

  constructor(fonts: ReadonlyMap<string, Font>, fallbacks: (primary: string) => string[]) {
    this.fonts = fonts
    this.fallbacks = fallbacks
  }

  has(fontId: string): boolean {
    return this.fonts.has(fontId)
  }

  private font(id: string): FontWithMetrics | undefined {
    return this.fonts.get(id) as FontWithMetrics | undefined
  }

  /** Splits text into runs, each drawn by the first font that has its glyphs. */
  private split(text: string, primary: string): { fontId: string; text: string }[] {
    const chain = [primary, ...this.fallbacks(primary)].filter((id) => this.fonts.has(id))
    const runs: { fontId: string; text: string }[] = []
    for (const ch of text) {
      const cp = ch.codePointAt(0)!
      let fontId: string
      const last = runs.at(-1)
      if (
        last &&
        (attachesToPrevious(cp) ||
          (/\s/.test(ch) && this.font(last.fontId)!.hasGlyphForCodePoint(cp)))
      ) {
        fontId = last.fontId
      } else {
        fontId = chain.find((id) => this.font(id)!.hasGlyphForCodePoint(cp)) ?? chain[0] ?? primary
      }
      if (last && last.fontId === fontId) last.text += ch
      else runs.push({ fontId, text: ch })
    }
    return runs
  }

  shape(text: string, fontId: string, sizePt: number): ShapedText {
    const sizeMm = sizePt * MM_PER_PT
    const primary = this.font(fontId) ?? this.font(this.fallbacks(fontId)[0] ?? '')
    const capHeight = primary
      ? ((primary.capHeight || primary.ascent * 0.7) / primary.unitsPerEm) * sizeMm
      : sizeMm * 0.7
    const runs: ShapedRun[] = []
    const missing: string[] = []
    let pen = 0
    let ink: InkBox | null = null

    for (const part of this.split(text, fontId)) {
      const font = this.font(part.fontId)
      if (!font) continue
      for (const ch of part.text)
        if (!/\s/.test(ch) && !font.hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.push(ch)
      const scale = sizeMm / font.unitsPerEm
      const { glyphs } = font.layout(part.text)
      const advances = glyphs.map((g) => g.advanceWidth * scale)
      let x = pen
      for (const [i, glyph] of glyphs.entries()) {
        const b = glyph.bbox
        if (Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX > b.minX) {
          const box = {
            x1: x + b.minX * scale,
            x2: x + b.maxX * scale,
            y1: -b.maxY * scale,
            y2: -b.minY * scale,
          }
          ink = ink
            ? {
                x1: Math.min(ink.x1, box.x1),
                y1: Math.min(ink.y1, box.y1),
                x2: Math.max(ink.x2, box.x2),
                y2: Math.max(ink.y2, box.y2),
              }
            : box
        }
        x += advances[i]!
      }
      const width = x - pen
      runs.push({ fontId: part.fontId, text: part.text, dx: pen, glyphs, scale, advances, width })
      pen = x
    }
    return { runs, width: pen, ink, capHeight, missing }
  }

  /** Width of `text` in mm. */
  width(text: string, fontId: string, sizePt: number): number {
    return this.shape(text, fontId, sizePt).width
  }

  /** Breaks text into lines no wider than `maxWidth` (keeps explicit line breaks). */
  wrap(text: string, fontId: string, sizePt: number, maxWidth: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.split(/\r?\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean)
      if (!words.length) {
        lines.push('')
        continue
      }
      let line = words[0]!
      for (const word of words.slice(1)) {
        const candidate = `${line} ${word}`
        if (this.width(candidate, fontId, sizePt) <= maxWidth) line = candidate
        else {
          lines.push(line)
          line = word
        }
      }
      lines.push(line)
    }
    return lines
  }

  /**
   * SVG path data for a shaped text drawn at (x, baseline), in mm. `slant`
   * shifts each point right by its height above the baseline times slant.
   */
  svgPath(shaped: ShapedText, x: number, baseline: number, slant = 0): string {
    let d = ''
    for (const run of shaped.runs) {
      let pen = x + run.dx
      for (const [i, glyph] of run.glyphs.entries()) {
        d += pathToSvg(
          glyph.path as unknown as { commands: PathCommand[] },
          run.scale,
          pen,
          baseline,
          slant
        )
        pen += run.advances[i]!
      }
    }
    return d
  }
}

const f = (n: number) => Math.round(n * 1000) / 1000

function pathToSvg(
  path: { commands: PathCommand[] },
  s: number,
  ox: number,
  oy: number,
  slant: number
): string {
  // Font units have y pointing up from the baseline.
  const P = (x: number, y: number) => `${f(ox + (x + y * slant) * s)} ${f(oy - y * s)}`
  let d = ''
  for (const { command, args: a } of path.commands) {
    switch (command) {
      case 'moveTo':
        d += `M${P(a[0]!, a[1]!)}`
        break
      case 'lineTo':
        d += `L${P(a[0]!, a[1]!)}`
        break
      case 'quadraticCurveTo':
        d += `Q${P(a[0]!, a[1]!)} ${P(a[2]!, a[3]!)}`
        break
      case 'bezierCurveTo':
        d += `C${P(a[0]!, a[1]!)} ${P(a[2]!, a[3]!)} ${P(a[4]!, a[5]!)}`
        break
      case 'closePath':
        d += 'Z'
        break
    }
  }
  return d
}

/** Weight encoded in a bundled font id (`montserrat-700` -> 700). */
export function fontWeight(fontId: string): number {
  const match = fontId.match(/-(\d{3})$/)
  return match ? Number(match[1]) : 400
}
