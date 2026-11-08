// Font helpers shared by the preview, the PDF worker and the font pickers.

import type { Font } from '@pdf-lib/fontkit'
import { slotTextFont, type CardDesign } from '#shared/cards/design'
import { fontWeight } from '#shared/cards/text'
import {
  FALLBACK_FONT_IDS,
  FALLBACK_FONT_IDS_BOLD,
  FONTS,
  findFont,
  type FontCategory,
} from '#shared/fonts'
import { customFontKey, isCustomFontId } from './design'

/** Fallback chain for a primary font; the worker must use the very same one. */
export function fallbackChain(primary: string): string[] {
  return fontWeight(primary) >= 600 ? FALLBACK_FONT_IDS_BOLD : FALLBACK_FONT_IDS
}

/** Every character a card code can contain (the batch id may change on registration). */
export const CODE_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ-'

/** A text and the font it is drawn with; coverage is checked per context. */
export interface FontContext {
  fontId: string
  text: string
}

export function fontContexts(design: CardDesign, labels: readonly string[]): FontContext[] {
  const contexts: FontContext[] = [
    { fontId: design.grid.font, text: labels.join('') + design.grid.freeText },
  ]
  for (const band of [design.header, design.footer]) {
    if (band.height <= 0) continue
    for (const slot of [band.left, band.center, band.right]) {
      if (slot.type === 'text' && slot.text.trim())
        contexts.push({ fontId: slotTextFont(band, slot).fontId, text: slot.text })
      if (slot.type === 'code') contexts.push({ fontId: band.style.font, text: CODE_CHARS })
    }
  }
  const b = design.back
  if (b.enabled) {
    if (b.title.trim()) contexts.push({ fontId: b.titleStyle.font, text: b.title })
    // The text block measures 'H' for its cap height.
    if (b.text.trim()) contexts.push({ fontId: b.textStyle.font, text: `H${b.text}` })
    if (b.showCode) contexts.push({ fontId: b.codeStyle.font, text: CODE_CHARS })
  }
  return contexts
}

/** Characters that never need their own glyph (they attach to the previous one). */
const IGNORABLE = /\s|\u200C|\u200D|[\uFE00-\uFE0F]/

export function coverageChars(text: string): string[] {
  const chars = new Set<string>()
  for (const ch of text) if (!IGNORABLE.test(ch)) chars.add(ch)
  return [...chars]
}

export interface FontResolution {
  /** Fonts the engine gets: the primaries plus the fallbacks that draw something. */
  fontIds: string[]
  /** Characters no font of their context's chain can draw. */
  missing: string[]
  /** Primary fonts that failed to load. */
  failed: string[]
}

/**
 * Decides which fonts the text engine needs. Primary fonts always load;
 * fallbacks load one at a time, in chain order, only while some character of
 * a context is not covered by its primary font or the fallbacks before.
 */
export async function resolveFontSet(
  contexts: FontContext[],
  load: (id: string) => Promise<Font | null>
): Promise<FontResolution> {
  const primaries = [...new Set(contexts.map((c) => c.fontId))]
  const loaded = new Map<string, Font>()
  const failed: string[] = []
  await Promise.all(
    primaries.map(async (id) => {
      const font = await load(id)
      if (font) loaded.set(id, font)
      else failed.push(id)
    })
  )

  // Characters each fallback chain has to cover, keyed by the chain itself.
  const needs = new Map<string[], Set<string>>()
  for (const context of contexts) {
    const primary = loaded.get(context.fontId)
    const chain = fallbackChain(context.fontId)
    for (const ch of coverageChars(context.text)) {
      if (primary?.hasGlyphForCodePoint(ch.codePointAt(0)!)) continue
      if (!needs.has(chain)) needs.set(chain, new Set())
      needs.get(chain)!.add(ch)
    }
  }

  const fallbacks: string[] = []
  const missing = new Set<string>()
  for (const [chain, chars] of needs) {
    let remaining = [...chars]
    for (const id of chain) {
      if (!remaining.length) break
      const font = loaded.get(id) ?? (await load(id))
      if (!font) continue
      loaded.set(id, font)
      const left = remaining.filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0)!))
      if (left.length < remaining.length && !fallbacks.includes(id)) fallbacks.push(id)
      remaining = left
    }
    for (const ch of remaining) missing.add(ch)
  }

  const fontIds = [...primaries.filter((id) => loaded.has(id))]
  for (const id of fallbacks) if (!fontIds.includes(id)) fontIds.push(id)
  return { fontIds, missing: [...missing], failed }
}

/** Public URL of a bundled font or data URL of an uploaded one. */
export function fontSource(design: Pick<CardDesign, 'customFonts'>, id: string): string | null {
  if (isCustomFontId(id)) return design.customFonts?.[customFontKey(id)]?.src ?? null
  return findFont(id)?.url ?? null
}

export function fontLabel(design: Pick<CardDesign, 'customFonts'>, id: string): string {
  if (isCustomFontId(id)) return design.customFonts?.[customFontKey(id)]?.name ?? 'Fuente subida'
  return findFont(id)?.label ?? id
}

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sin serifa',
  serif: 'Con serifa',
  display: 'Decorativas',
  script: 'Manuscritas',
  mono: 'Monoespaciadas',
  fallback: 'Cobertura amplia',
}

const CATEGORY_ORDER: FontCategory[] = ['sans', 'serif', 'display', 'script', 'mono', 'fallback']

/** Fallback fonts that only make sense as fallbacks (no Latin letters to show). */
const SYMBOL_ONLY = new Set(
  FONTS.filter((f) => f.category === 'fallback' && f.family !== 'Noto Sans').map((f) => f.id)
)

export interface FontOption {
  id: string
  label: string
}

export interface FontGroup {
  label: string
  fonts: FontOption[]
}

/** Font picker groups; symbol-only fonts are listed only when already selected. */
export function fontGroups(design: Pick<CardDesign, 'customFonts'>, current: string): FontGroup[] {
  const groups: FontGroup[] = []
  const custom = Object.entries(design.customFonts ?? {}).map(([key, f]) => ({
    id: `custom:${key}`,
    label: f.name,
  }))
  if (custom.length) groups.push({ label: 'Subidas', fonts: custom })
  for (const category of CATEGORY_ORDER) {
    const fonts = FONTS.filter(
      (f) => f.category === category && (!SYMBOL_ONLY.has(f.id) || f.id === current)
    ).map((f) => ({ id: f.id, label: f.label }))
    if (fonts.length) groups.push({ label: FONT_CATEGORY_LABELS[category], fonts })
  }
  return groups
}

/**
 * TrueType or OpenType only: pdf-lib embeds the raw bytes, so WOFF/WOFF2 or
 * collections would produce a broken PDF even though fontkit can read them.
 */
export function isEmbeddableFont(bytes: Uint8Array): boolean {
  const tag = String.fromCharCode(...bytes.subarray(0, 4))
  return tag === '\x00\x01\x00\x00' || tag === 'true' || tag === 'OTTO'
}

/** CSS family the pickers use to show a font in itself. */
export function previewFamily(id: string): string {
  return `bf-${id.replace(/[^a-z0-9-]/gi, '-')}`
}

const registered = new Map<string, FontFace>()

/** Registers (once) and starts loading a font for the UI. */
export function ensureFontFace(id: string, src: string | null): void {
  if (!src || registered.has(id) || typeof FontFace === 'undefined') return
  const face = new FontFace(previewFamily(id), `url("${src}")`, { display: 'swap' })
  registered.set(id, face)
  document.fonts.add(face)
  face.load().catch(() => {
    // The option keeps the UI font; the generator reports load errors itself.
  })
}

export function fontFamilyStyle(id: string): string {
  return `"${previewFamily(id)}", ui-sans-serif, system-ui, sans-serif`
}
