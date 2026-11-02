import fontkit from '@pdf-lib/fontkit'
import type { Font } from '@pdf-lib/fontkit'
import { until, watchDebounced } from '@vueuse/core'
import type { CardDesign } from '#shared/cards/design'
import { TextEngine } from '#shared/cards/text'
import {
  coverageChars,
  fallbackChain,
  fontContexts,
  fontSource,
  resolveFontSet,
  type FontContext,
} from '~/utils/generator/fonts'

// Loads the TTF bytes the cards need and builds the TextEngine shared by the
// preview and the PDF worker. Each font is fetched once per page visit.

interface LoadedFont {
  /** Where it came from: an uploaded font may be replaced under the same id. */
  src: string
  bytes: ArrayBuffer
  font: Font
}

export function useFontEngine(
  design: Ref<CardDesign>,
  labels: Ref<string[]>,
  enabled: Ref<boolean>
) {
  const cache = new Map<string, LoadedFont>()
  const pending = new Map<string, Promise<Font | null>>()

  const engine = shallowRef<TextEngine | null>(null)
  /** Fonts in the engine, in a stable order. */
  const fontIds = shallowRef<string[]>([])
  /** The very font objects (and bytes) in the engine, same order as fontIds. */
  let engineEntries: LoadedFont[] = []
  /** Characters no font in their context's chain can draw. */
  const missing = ref<string[]>([])
  /** Design fonts that failed to load (their text falls back to Noto). */
  const failed = ref<string[]>([])
  /** Request key the current engine was built for. */
  const builtKey = ref<string | null>(null)

  function load(id: string): Promise<Font | null> {
    const src = fontSource(design.value, id)
    if (!src) return Promise.resolve(null)
    const hit = cache.get(id)
    if (hit?.src === src) return Promise.resolve(hit.font)
    const key = `${id}|${src.length}`
    const inFlight = pending.get(key)
    if (inFlight) return inFlight
    const promise = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then((bytes) => {
        const font = fontkit.create(new Uint8Array(bytes))
        if (typeof font.hasGlyphForCodePoint !== 'function') throw new Error('Unsupported font')
        cache.set(id, { src, bytes, font })
        return font
      })
      .catch(() => null)
      .finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }

  // Contexts merged per font with their distinct characters, so typing a
  // text with the same characters does not rebuild the engine.
  const request = computed(() => {
    const byFont = new Map<string, Set<string>>()
    for (const context of fontContexts(design.value, labels.value)) {
      const chars = byFont.get(context.fontId) ?? new Set<string>()
      for (const ch of coverageChars(context.text)) chars.add(ch)
      byFont.set(context.fontId, chars)
    }
    const contexts: FontContext[] = [...byFont].map(([fontId, chars]) => ({
      fontId,
      text: [...chars].sort().join(''),
    }))
    const key = contexts.map((c) => `${c.fontId}\u0000${c.text}`).join('\u0001')
    return { contexts, key }
  })

  /**
   * True from the very moment the design asks for other fonts or characters
   * (not only once the debounced rebuild starts), so nothing can render a
   * PDF with an engine that does not match the design.
   */
  const loading = computed(() => builtKey.value !== request.value.key)

  let token = 0
  async function rebuild() {
    const mine = ++token
    const { contexts, key } = request.value
    const result = await resolveFontSet(contexts, load)
    if (mine !== token) return
    const entries = result.fontIds.map((id) => cache.get(id)!)
    const same =
      engine.value &&
      result.fontIds.length === fontIds.value.length &&
      result.fontIds.every((id, i) => id === fontIds.value[i] && entries[i] === engineEntries[i])
    if (!same) {
      const fonts = new Map<string, Font>()
      result.fontIds.forEach((id, i) => fonts.set(id, entries[i]!.font))
      engine.value = markRaw(new TextEngine(fonts, fallbackChain))
      fontIds.value = result.fontIds
      engineEntries = entries
    }
    missing.value = result.missing
    failed.value = result.failed
    builtKey.value = key
  }

  watchDebounced(
    () => (enabled.value ? request.value.key : null),
    (key) => {
      if (key !== null) void rebuild()
    },
    { debounce: 150, immediate: true }
  )

  /** Bytes of exactly the fonts in the engine, for the PDF worker. */
  function engineFonts(): [string, ArrayBuffer][] {
    return fontIds.value.map((id, i) => [id, engineEntries[i]!.bytes])
  }

  /** Waits until the engine matches the current design. */
  async function settled(): Promise<TextEngine | null> {
    if (!loading.value && engine.value) return engine.value
    await until(loading).toBe(false)
    return engine.value
  }

  return { engine, fontIds, missing, failed, loading, engineFonts, settled }
}

export type FontEngine = ReturnType<typeof useFontEngine>
