// Fonts bundled in public/fonts (static TTF instances from Google Fonts,
// downloaded by `pnpm fonts:fetch`). The card generator embeds them in the
// PDF, so they must be static instances: pdf-lib only embeds the default
// instance of a variable font and would ignore the weight.

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'mono' | 'fallback'

export interface FontFamilyEntry {
  /** Google Fonts family name. */
  family: string
  /** Static weights to bundle. */
  weights: number[]
  category: FontCategory
}

export interface FontEntry {
  /** Stable id, e.g. `montserrat-700`. Saved in designs. */
  id: string
  family: string
  weight: number
  category: FontCategory
  /** Public URL of the TTF file. */
  url: string
  /** Label for the font pickers. */
  label: string
}

export const FONT_FAMILIES: FontFamilyEntry[] = [
  { family: 'Montserrat', weights: [400, 500, 700, 800], category: 'sans' },
  { family: 'Lexend Deca', weights: [400, 700], category: 'sans' },
  { family: 'Poppins', weights: [400, 600, 700], category: 'sans' },
  { family: 'Roboto', weights: [400, 700], category: 'sans' },
  { family: 'Nunito', weights: [400, 800], category: 'sans' },
  { family: 'Fredoka', weights: [500, 700], category: 'sans' },
  { family: 'Oswald', weights: [500, 700], category: 'sans' },
  { family: 'Merriweather', weights: [400, 700], category: 'serif' },
  { family: 'Playfair Display', weights: [400, 700], category: 'serif' },
  { family: 'Bebas Neue', weights: [400], category: 'display' },
  { family: 'Righteous', weights: [400], category: 'display' },
  { family: 'Bangers', weights: [400], category: 'display' },
  { family: 'Press Start 2P', weights: [400], category: 'display' },
  { family: 'Permanent Marker', weights: [400], category: 'script' },
  { family: 'Lobster', weights: [400], category: 'script' },
  { family: 'Pacifico', weights: [400], category: 'script' },
  { family: 'Alex Brush', weights: [400], category: 'script' },
  { family: 'Roboto Mono', weights: [500, 700], category: 'mono' },
  // Fallback chain for glyphs the chosen font lacks (Greek, math, symbols).
  { family: 'Noto Sans', weights: [400, 700], category: 'fallback' },
  { family: 'Noto Sans Math', weights: [400], category: 'fallback' },
  { family: 'Noto Sans Symbols', weights: [400, 700], category: 'fallback' },
  { family: 'Noto Sans Symbols 2', weights: [400], category: 'fallback' },
  { family: 'Noto Emoji', weights: [400, 700], category: 'fallback' },
]

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
}

export function fontSlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function fontId(family: string, weight: number): string {
  return `${fontSlug(family)}-${weight}`
}

export const FONTS: FontEntry[] = FONT_FAMILIES.flatMap((f) =>
  f.weights.map((weight) => ({
    id: fontId(f.family, weight),
    family: f.family,
    weight,
    category: f.category,
    url: `/fonts/${fontId(f.family, weight)}.ttf`,
    label: f.weights.length > 1 ? `${f.family} ${WEIGHT_NAMES[weight] ?? weight}` : f.family,
  }))
)

/** Fonts tried, in order, for any glyph the chosen font cannot draw. */
export const FALLBACK_FONT_IDS: string[] = [
  'noto-sans-400',
  'noto-sans-math-400',
  'noto-sans-symbols-400',
  'noto-sans-symbols-2-400',
  'noto-emoji-400',
]

/** Bold variant of each fallback, used when the chosen font is bold. */
export const FALLBACK_FONT_IDS_BOLD: string[] = [
  'noto-sans-700',
  'noto-sans-math-400',
  'noto-sans-symbols-700',
  'noto-sans-symbols-2-400',
  'noto-emoji-700',
]

export function findFont(id: string): FontEntry | undefined {
  return FONTS.find((f) => f.id === id)
}

/**
 * Bold weight of a bundled font's family (700 when it has it, else the
 * lightest weight from 600), or null when the font is already bold, is not
 * bundled or its family has no bold weight.
 */
export function boldFontId(id: string): string | null {
  const font = findFont(id)
  if (!font || font.weight >= 600) return null
  const bold = FONTS.filter((f) => f.family === font.family && f.weight >= 600).sort(
    (a, b) => Math.abs(a.weight - 700) - Math.abs(b.weight - 700) || a.weight - b.weight
  )[0]
  return bold?.id ?? null
}
