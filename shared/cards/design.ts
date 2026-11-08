// Card design: everything the generator lets people customise. Sizes are in
// millimetres and font sizes in points. Designs are plain JSON so they can be
// saved in the browser, exported and imported.

import { boldFontId } from '../fonts.ts'

export const DESIGN_VERSION = 1

/** Content of a header/footer slot. */
export type SlotContent =
  | { type: 'none' }
  | {
      type: 'text'
      text: string
      /** Bolder than the band's font. */
      bold?: boolean
      /** Slanted. */
      italic?: boolean
    }
  | { type: 'image'; imageId: string }
  /** The card code (`K3F9-042`). */
  | { type: 'code' }

export interface TextStyle {
  /** Font id from shared/fonts.ts, or `custom:<id>` for an uploaded font. */
  font: string
  /** Points. */
  size: number
  color: string
}

export interface BandDesign {
  /** Height in mm; 0 hides the band. */
  height: number
  style: TextStyle
  left: SlotContent
  center: SlotContent
  right: SlotContent
}

export interface GridDesign {
  font: string
  textColor: string
  /** Upper bound in points; the text shrinks to fit the cells. */
  maxFontSize: number
  /** Share of the cell the text may fill (0.3 to 0.95). */
  fill: number
  filledColor: string
  emptyColor: string
  freeColor: string
  freeText: string
  freeTextColor: string
  /** Image drawn in the free cell instead of the text. */
  freeImageId: string | null
  lineColor: string
  /** Inner lines, mm. */
  lineWidth: number
  /** Outer frame of the grid, mm. */
  outerLineWidth: number
  /** Keep cells square (the grid shrinks and centres) instead of filling the area. */
  squareCells: boolean
}

/** Where the card code goes on the back: a corner or edge, or under the centred block. */
export type BackCodePosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'below'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export const BACK_CODE_POSITIONS: readonly BackCodePosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'below',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

export interface BackDesign {
  enabled: boolean
  background: string
  imageId: string | null
  imageFit: 'cover' | 'contain'
  logoId: string | null
  /** Logo height as a share of the card height (0 to 0.9). */
  logoHeight: number
  title: string
  titleStyle: TextStyle
  /** Free text; line breaks are kept and long lines wrap. */
  text: string
  textStyle: TextStyle
  showCode: boolean
  codePosition: BackCodePosition
  codeStyle: TextStyle
}

export interface DesignImage {
  name: string
  /** URL (`/api/branding/logo`, `/logotipo.svg`) or data URL of an upload. */
  src: string
  /** Intrinsic size in px, to keep the aspect ratio when fitting. */
  width: number
  height: number
}

export interface CardDesign {
  version: number
  width: number
  height: number
  /** Inner margin of the card, mm. */
  padding: number
  /** Space between header, grid and footer, mm. */
  spacing: number
  background: string
  borderColor: string
  /** Card outline, mm; 0 for none. */
  borderWidth: number
  borderRadius: number
  header: BandDesign
  grid: GridDesign
  footer: BandDesign
  back: BackDesign
  images: Record<string, DesignImage>
  /** Fonts uploaded in the generator, referenced as `custom:<key>`. */
  customFonts?: Record<string, { name: string; /** data URL of the TTF/OTF */ src: string }>
}

export const MM_PER_PT = 25.4 / 72
export const PT_PER_MM = 72 / 25.4

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

export const CARD_SIZE_PRESETS: SizePreset[] = [
  { id: 'classic', label: 'Clásico 100 × 50 mm', width: 100, height: 50 },
  { id: 'a7', label: 'A7 horizontal 105 × 74 mm', width: 105, height: 74 },
  { id: 'third-a4', label: 'Tercio de A4 210 × 99 mm', width: 210, height: 99 },
  { id: 'a6', label: 'A6 horizontal 148 × 105 mm', width: 148, height: 105 },
  { id: 'a6-portrait', label: 'A6 vertical 105 × 148 mm', width: 105, height: 148 },
  { id: 'square', label: 'Cuadrado 100 × 100 mm', width: 100, height: 100 },
  { id: 'card', label: 'Tarjeta 85 × 55 mm', width: 85, height: 55 },
]

export const PAPER_PRESETS: SizePreset[] = [
  { id: 'a4', label: 'A4 (210 × 297 mm)', width: 210, height: 297 },
  { id: 'a3', label: 'A3 (297 × 420 mm)', width: 297, height: 420 },
  { id: 'a5', label: 'A5 (148 × 210 mm)', width: 148, height: 210 },
  { id: 'sra3', label: 'SRA3 (320 × 450 mm)', width: 320, height: 450 },
  { id: 'letter', label: 'Carta (215,9 × 279,4 mm)', width: 215.9, height: 279.4 },
  { id: 'legal', label: 'Legal (215,9 × 355,6 mm)', width: 215.9, height: 355.6 },
  { id: 'tabloid', label: 'Tabloide (279,4 × 431,8 mm)', width: 279.4, height: 431.8 },
]

/** Image id the generator binds to the logo set in the panel. */
export const SERVER_LOGO_ID = 'logo'

export function defaultDesign(options: { title?: string; accent?: string } = {}): CardDesign {
  const accent = options.accent ?? '#ff6b6b'
  return {
    version: DESIGN_VERSION,
    width: 100,
    height: 50,
    padding: 2.5,
    spacing: 1,
    background: '#ffffff',
    borderColor: '#000000',
    borderWidth: 0.1,
    borderRadius: 0,
    header: {
      height: 8,
      style: { font: 'lexend-deca-700', size: 16, color: '#111111' },
      left: { type: 'none' },
      center: { type: 'text', text: options.title ?? 'Bingo' },
      right: { type: 'none' },
    },
    grid: {
      font: 'montserrat-700',
      textColor: '#111111',
      maxFontSize: 14,
      fill: 0.62,
      filledColor: '#ffffff',
      emptyColor: accent,
      freeColor: accent,
      freeText: 'LIBRE',
      freeTextColor: '#ffffff',
      freeImageId: null,
      lineColor: '#000000',
      lineWidth: 0.4,
      outerLineWidth: 0.6,
      squareCells: false,
    },
    footer: {
      height: 5,
      style: { font: 'montserrat-500', size: 7, color: '#333333' },
      left: { type: 'code' },
      center: { type: 'image', imageId: SERVER_LOGO_ID },
      right: { type: 'none' },
    },
    back: {
      enabled: true,
      background: accent,
      imageId: null,
      imageFit: 'cover',
      logoId: SERVER_LOGO_ID,
      logoHeight: 0.4,
      title: options.title ?? 'Bingo',
      titleStyle: { font: 'lexend-deca-700', size: 20, color: '#ffffff' },
      text: '¡Mucha suerte!',
      textStyle: { font: 'montserrat-500', size: 10, color: '#ffffff' },
      showCode: true,
      codePosition: 'bottom-right',
      codeStyle: { font: 'roboto-mono-500', size: 7, color: '#ffffff' },
    },
    images: {
      [SERVER_LOGO_ID]: {
        name: 'Logo del panel',
        src: '/api/branding/logo',
        width: 330,
        height: 104,
      },
    },
  }
}

/** Slant of synthetic italics (tan 12°): x shift per unit of height. */
export const ITALIC_SLANT = Math.tan((12 * Math.PI) / 180)

/** Outline added around glyphs for synthetic bold, as a share of the font size. */
export const FAKE_BOLD_STROKE = 0.04

/**
 * Font a text slot is drawn with. Bold switches to the bold weight of the
 * band font's family; when there is none (the font is already bold, has a
 * single weight or was uploaded) the glyphs get an outline instead.
 */
export function slotTextFont(
  band: BandDesign,
  slot: SlotContent
): { fontId: string; fakeBold: boolean } {
  const fontId = band.style.font
  if (slot.type !== 'text' || !slot.bold) return { fontId, fakeBold: false }
  const bold = boldFontId(fontId)
  return bold ? { fontId: bold, fakeBold: false } : { fontId, fakeBold: true }
}

/** Ids of the images a design actually uses. */
export function usedImageIds(design: CardDesign): string[] {
  const ids = new Set<string>()
  for (const band of [design.header, design.footer])
    for (const slot of [band.left, band.center, band.right])
      if (slot.type === 'image') ids.add(slot.imageId)
  if (design.grid.freeImageId) ids.add(design.grid.freeImageId)
  if (design.back.enabled) {
    if (design.back.imageId) ids.add(design.back.imageId)
    if (design.back.logoId) ids.add(design.back.logoId)
  }
  return [...ids].filter((id) => design.images[id])
}

/** Font ids a design uses (before fallbacks). */
export function usedFontIds(design: CardDesign): string[] {
  const ids = new Set<string>([
    design.header.style.font,
    design.footer.style.font,
    design.grid.font,
  ])
  for (const band of [design.header, design.footer])
    for (const slot of [band.left, band.center, band.right])
      if (slot.type === 'text') ids.add(slotTextFont(band, slot).fontId)
  if (design.back.enabled) {
    ids.add(design.back.titleStyle.font)
    ids.add(design.back.textStyle.font)
    ids.add(design.back.codeStyle.font)
  }
  return [...ids]
}
