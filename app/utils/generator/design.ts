// Repairs designs read from storage or imported from a file: missing fields
// take the default, unknown fonts fall back to the default font of their
// field and the panel logo is always available.

import {
  DESIGN_VERSION,
  SERVER_LOGO_ID,
  defaultDesign,
  type BandDesign,
  type CardDesign,
  type DesignImage,
  type SlotContent,
  type TextStyle,
} from '#shared/cards/design'
import { findFont } from '#shared/fonts'

export const CUSTOM_FONT_PREFIX = 'custom:'

/** URL of the logo set in the panel, light variant (cards are printed on white). */
export function serverLogoUrl(logoVersion: number): string {
  return `/api/branding/logo?variant=light&v=${logoVersion}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Keys of an imported map that are safe to copy into a plain object. */
function safeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && key.length <= 64
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function str(value: unknown, fallback: string, maxLength = 2000): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function isCustomFontId(id: string): boolean {
  return id.startsWith(CUSTOM_FONT_PREFIX)
}

export function customFontKey(id: string): string {
  return id.slice(CUSTOM_FONT_PREFIX.length)
}

/** True when the font id can be loaded with this design. */
export function fontExists(design: Pick<CardDesign, 'customFonts'>, id: string): boolean {
  if (isCustomFontId(id)) return !!design.customFonts?.[customFontKey(id)]
  return !!findFont(id)
}

function font(value: unknown, fallback: string, customFonts: CardDesign['customFonts']): string {
  if (typeof value !== 'string') return fallback
  return fontExists({ customFonts }, value) ? value : fallback
}

function textStyle(
  value: unknown,
  base: TextStyle,
  customFonts: CardDesign['customFonts']
): TextStyle {
  const v = isRecord(value) ? value : {}
  return {
    font: font(v.font, base.font, customFonts),
    size: num(v.size, base.size, 2, 200),
    color: color(v.color, base.color),
  }
}

function slot(value: unknown, base: SlotContent, images: Record<string, DesignImage>): SlotContent {
  if (!isRecord(value)) return base
  switch (value.type) {
    case 'none':
      return { type: 'none' }
    case 'code':
      return { type: 'code' }
    case 'text':
      return { type: 'text', text: str(value.text, '', 300) }
    case 'image':
      return typeof value.imageId === 'string' && images[value.imageId]
        ? { type: 'image', imageId: value.imageId }
        : { type: 'none' }
    default:
      return base
  }
}

function band(
  value: unknown,
  base: BandDesign,
  images: Record<string, DesignImage>,
  customFonts: CardDesign['customFonts']
): BandDesign {
  const v = isRecord(value) ? value : {}
  return {
    height: num(v.height, base.height, 0, 200),
    style: textStyle(v.style, base.style, customFonts),
    left: slot(v.left, base.left, images),
    center: slot(v.center, base.center, images),
    right: slot(v.right, base.right, images),
  }
}

function imageRef(value: unknown, fallback: string | null, images: Record<string, DesignImage>) {
  if (value === null) return null
  return typeof value === 'string' && images[value] ? value : fallback
}

function images(value: unknown, base: Record<string, DesignImage>): Record<string, DesignImage> {
  const out: Record<string, DesignImage> = {}
  if (isRecord(value))
    for (const [id, raw] of Object.entries(value)) {
      if (!safeKey(id) || !isRecord(raw) || typeof raw.src !== 'string') continue
      // Uploads are data URLs; anything else must be a same-origin path.
      const src = raw.src
      const sameOrigin = src.startsWith('/') && !src.startsWith('//')
      if (!src.startsWith('data:image/') && !sameOrigin) continue
      const width = num(raw.width, 0, 0, 100_000)
      const height = num(raw.height, 0, 0, 100_000)
      if (!width || !height) continue
      out[id] = { name: str(raw.name, id, 120) || id, src, width, height }
    }
  // The panel logo cannot be removed; its URL is refreshed from the settings.
  if (!out[SERVER_LOGO_ID]) out[SERVER_LOGO_ID] = { ...base[SERVER_LOGO_ID]! }
  return out
}

function customFonts(value: unknown): CardDesign['customFonts'] {
  const out: NonNullable<CardDesign['customFonts']> = {}
  if (isRecord(value))
    for (const [key, raw] of Object.entries(value)) {
      if (!safeKey(key) || !isRecord(raw) || typeof raw.src !== 'string') continue
      if (!raw.src.startsWith('data:')) continue
      out[key] = { name: str(raw.name, key, 120) || key, src: raw.src }
    }
  return out
}

/** A complete, valid design built from anything (a stored or imported JSON). */
export function sanitizeDesign(raw: unknown, base: CardDesign = defaultDesign()): CardDesign {
  const v = isRecord(raw) ? raw : {}
  const fonts = customFonts(v.customFonts)
  const imgs = images(v.images, base.images)
  const g = isRecord(v.grid) ? v.grid : {}
  const b = isRecord(v.back) ? v.back : {}
  return {
    version: DESIGN_VERSION,
    width: num(v.width, base.width, 20, 500),
    height: num(v.height, base.height, 20, 500),
    padding: num(v.padding, base.padding, 0, 50),
    spacing: num(v.spacing, base.spacing, 0, 50),
    background: color(v.background, base.background),
    borderColor: color(v.borderColor, base.borderColor),
    borderWidth: num(v.borderWidth, base.borderWidth, 0, 10),
    borderRadius: num(v.borderRadius, base.borderRadius, 0, 100),
    header: band(v.header, base.header, imgs, fonts),
    footer: band(v.footer, base.footer, imgs, fonts),
    grid: {
      font: font(g.font, base.grid.font, fonts),
      textColor: color(g.textColor, base.grid.textColor),
      maxFontSize: num(g.maxFontSize, base.grid.maxFontSize, 4, 200),
      fill: num(g.fill, base.grid.fill, 0.3, 0.95),
      filledColor: color(g.filledColor, base.grid.filledColor),
      emptyColor: color(g.emptyColor, base.grid.emptyColor),
      freeColor: color(g.freeColor, base.grid.freeColor),
      freeText: str(g.freeText, base.grid.freeText, 60),
      freeTextColor: color(g.freeTextColor, base.grid.freeTextColor),
      freeImageId: imageRef(g.freeImageId, base.grid.freeImageId, imgs),
      lineColor: color(g.lineColor, base.grid.lineColor),
      lineWidth: num(g.lineWidth, base.grid.lineWidth, 0, 10),
      outerLineWidth: num(g.outerLineWidth, base.grid.outerLineWidth, 0, 10),
      squareCells: bool(g.squareCells, base.grid.squareCells),
    },
    back: {
      enabled: bool(b.enabled, base.back.enabled),
      background: color(b.background, base.back.background),
      imageId: imageRef(b.imageId, base.back.imageId, imgs),
      imageFit:
        b.imageFit === 'cover' || b.imageFit === 'contain' ? b.imageFit : base.back.imageFit,
      logoId: imageRef(b.logoId, base.back.logoId, imgs),
      logoHeight: num(b.logoHeight, base.back.logoHeight, 0, 0.9),
      title: str(b.title, base.back.title, 200),
      titleStyle: textStyle(b.titleStyle, base.back.titleStyle, fonts),
      text: str(b.text, base.back.text, 2000),
      textStyle: textStyle(b.textStyle, base.back.textStyle, fonts),
      showCode: bool(b.showCode, base.back.showCode),
      codeStyle: textStyle(b.codeStyle, base.back.codeStyle, fonts),
    },
    images: imgs,
    customFonts: fonts,
  }
}

/** Removes an image and every reference to it. */
export function removeImageFromDesign(design: CardDesign, imageId: string): void {
  for (const b of [design.header, design.footer])
    for (const key of ['left', 'center', 'right'] as const) {
      const s = b[key]
      if (s.type === 'image' && s.imageId === imageId) b[key] = { type: 'none' }
    }
  if (design.grid.freeImageId === imageId) design.grid.freeImageId = null
  if (design.back.imageId === imageId) design.back.imageId = null
  if (design.back.logoId === imageId) design.back.logoId = null
  Reflect.deleteProperty(design.images, imageId)
}

/** Removes an uploaded font; its uses fall back to the default font of each field. */
export function removeCustomFontFromDesign(design: CardDesign, fontId: string): void {
  const base = defaultDesign()
  const swap = (current: string, fallback: string) => (current === fontId ? fallback : current)
  design.header.style.font = swap(design.header.style.font, base.header.style.font)
  design.footer.style.font = swap(design.footer.style.font, base.footer.style.font)
  design.grid.font = swap(design.grid.font, base.grid.font)
  design.back.titleStyle.font = swap(design.back.titleStyle.font, base.back.titleStyle.font)
  design.back.textStyle.font = swap(design.back.textStyle.font, base.back.textStyle.font)
  design.back.codeStyle.font = swap(design.back.codeStyle.font, base.back.codeStyle.font)
  if (design.customFonts) Reflect.deleteProperty(design.customFonts, customFontKey(fontId))
}
