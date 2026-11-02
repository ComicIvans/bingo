import { useEventListener, watchDebounced } from '@vueuse/core'
import { defaultDesign, type CardDesign } from '#shared/cards/design'
import { gridSpecFor, validateSpec } from '#shared/cards/grid'
import { computeImposition } from '#shared/cards/impose'
import { DEFAULT_SETTINGS, type Settings } from '#shared/types/api'
import { sanitizeDesign } from '~/utils/generator/design'
import { downloadJson, hashString, pickFile, readFileText, slugify } from '~/utils/generator/files'
import {
  LOCAL_SET_VALUE,
  defaultOptions,
  formatFromOptions,
  newBatchId,
  newSeed,
  sanitizeLocalSet,
  sanitizeOptions,
  sanitizeSheet,
  type GeneratorOptions,
  type LocalSet,
} from '~/utils/generator/options'
import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '~/utils/generator/storage'
import { useFontEngine } from './useFontEngine'
import { useGeneratorSets } from './useGeneratorSets'
import { useImageLibrary } from './useImageLibrary'
import { usePdfExport, type ActiveSet } from './usePdfExport'
import { usePreview } from './usePreview'

// State of the card generator page, created once by the page and provided
// to every section (accordion sections unmount when closed, so no section
// keeps state of its own).

export const DESIGN_FILE_TYPE = 'bingo-card-design'

export function createGenerator() {
  const toast = useToast()

  const ready = ref(false)
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const design = ref<CardDesign>(defaultDesign())
  const options = ref<GeneratorOptions>(defaultOptions())
  const localSet = ref<LocalSet | null>(null)
  /** 'quota' when images/fonts did not fit in the browser storage. */
  const storageProblem = ref<'quota' | 'unavailable' | null>(null)

  const sets = useGeneratorSets()

  const activeSet = computed<ActiveSet | null>(() => {
    if (options.value.setId === LOCAL_SET_VALUE) {
      const local = localSet.value
      if (!local) return null
      // The labels' hash keeps two different local sets with the same name apart.
      const labels = local.items.map((item) => item.label).join('\n')
      return {
        id: `local-${slugify(local.name) || 'conjunto'}-${hashString(labels)}`,
        name: local.name.trim() || 'Conjunto propio',
        color: local.color,
        items: local.items,
        local: true,
      }
    }
    const set = sets.current.value
    if (!set || set.id !== options.value.setId) return null
    return { id: set.id, name: set.name, color: set.color, items: set.items, local: false }
  })

  const items = computed(() => activeSet.value?.items ?? [])
  const labels = computed(() => items.value.map((item) => item.label))
  const format = computed(() => formatFromOptions(options.value))
  const spec = computed(() => gridSpecFor(format.value))
  const specErrors = computed(() =>
    activeSet.value ? validateSpec(spec.value, items.value.length) : []
  )
  const imposition = computed(() =>
    computeImposition(design.value.width, design.value.height, options.value.sheet)
  )

  const plural = (n: number, one: string, many: string) =>
    `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`

  /** What the PDF will contain, or why it cannot be made. */
  const printPlan = computed(() => {
    const imp = imposition.value
    if ('error' in imp) return { error: imp.error, text: imp.error }
    const o = options.value
    const count = o.firstSheetOnly ? Math.min(o.count, imp.perPage) : o.count
    const sheets = Math.ceil(count / imp.perPage)
    const pages = sheets * (design.value.back.enabled ? 2 : 1)
    const size = `${imp.pageWidth.toLocaleString('es-ES')} × ${imp.pageHeight.toLocaleString('es-ES')} mm`
    const text =
      o.sheet.mode === 'single'
        ? `${plural(count, 'cartón', 'cartones')}, ${plural(pages, 'página', 'páginas')} de ${size}`
        : `${plural(imp.perPage, 'cartón', 'cartones')} por folio, ${plural(sheets, 'folio', 'folios')}, ${plural(pages, 'página', 'páginas')}`
    return { error: null, text, count, sheets, pages, perPage: imp.perPage }
  })

  const fonts = useFontEngine(design, labels, ready)
  const images = useImageLibrary(design)
  const preview = usePreview({
    design,
    options,
    spec,
    specErrors,
    items,
    imposition,
    engine: fonts.engine,
    imageHref: images.href,
  })
  const defaultBatchName = computed(
    () =>
      `${activeSet.value?.name ?? 'Cartones'} · ${new Date().toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`
  )
  const exporter = usePdfExport({
    design,
    options,
    activeSet,
    format,
    spec,
    imposition,
    fonts,
    images,
    defaultBatchName,
    refreshSet: sets.refresh,
  })

  const canGenerate = computed(
    () =>
      ready.value &&
      !!activeSet.value &&
      !sets.loading.value &&
      !specErrors.value.length &&
      !('error' in imposition.value) &&
      // Only the first load blocks the button: a download waits for any later
      // font change itself, so typing never toggles it.
      !!fonts.engine.value
  )

  // ─── Persistence ─────────────────────────────────────────────────────────

  let quotaWarned = false

  function saveDesign() {
    const result = writeStorage(STORAGE_KEYS.design, design.value)
    if (result === 'ok') {
      storageProblem.value = null
      return
    }
    if (result === 'quota') {
      // Keep at least the settings: drop uploads, which are what fills the quota.
      const d = design.value
      const light: CardDesign = {
        ...d,
        images: Object.fromEntries(
          Object.entries(d.images).filter(([, image]) => !image.src.startsWith('data:'))
        ),
        customFonts: {},
      }
      writeStorage(STORAGE_KEYS.design, sanitizeDesign(light))
      storageProblem.value = 'quota'
      if (!quotaWarned) {
        quotaWarned = true
        toast.add({
          title: 'El diseño no cabe en el navegador',
          description:
            'Las imágenes o fuentes subidas ocupan demasiado y no se guardarán al cerrar la página. Puedes seguir trabajando y usar «Exportar diseño» para conservarlo.',
          color: 'warning',
          icon: 'i-lucide-hard-drive',
          duration: 10_000,
        })
      }
    } else storageProblem.value = 'unavailable'
  }

  watchDebounced(design, () => ready.value && saveDesign(), { deep: true, debounce: 600 })
  watchDebounced(options, () => ready.value && writeStorage(STORAGE_KEYS.options, options.value), {
    deep: true,
    debounce: 400,
  })
  // The debounced saves would be lost if the tab closes right after an edit.
  useEventListener('pagehide', () => {
    if (!ready.value) return
    saveDesign()
    writeStorage(STORAGE_KEYS.options, options.value)
  })
  watch(
    localSet,
    (value) => {
      if (!ready.value) return
      if (value) writeStorage(STORAGE_KEYS.localSet, value)
      else removeStorage(STORAGE_KEYS.localSet)
    },
    { deep: true }
  )

  // ─── Set selection ───────────────────────────────────────────────────────

  watch(
    () => options.value.setId,
    (id) => {
      if (ready.value && id && id !== LOCAL_SET_VALUE) void sets.select(id)
    }
  )

  async function init() {
    options.value = sanitizeOptions(readStorage(STORAGE_KEYS.options))
    localSet.value = sanitizeLocalSet(readStorage(STORAGE_KEYS.localSet))
    const savedDesign = readStorage(STORAGE_KEYS.design)

    const [loadedSettings] = await Promise.all([
      $fetch<Settings>('/api/settings').catch(() => null),
      sets.loadList(),
      exporter.refreshSession(),
    ])
    if (loadedSettings) settings.value = loadedSettings

    const o = options.value
    const known = sets.list.value.some((s) => s.id === o.setId)
    if (o.setId === LOCAL_SET_VALUE ? !localSet.value : !known)
      o.setId = sets.list.value[0]?.id ?? ''
    if (o.setId && o.setId !== LOCAL_SET_VALUE) await sets.select(o.setId)

    design.value = savedDesign
      ? sanitizeDesign(savedDesign)
      : defaultDesign({ title: settings.value.title, accent: activeSet.value?.color })
    void images.syncLogo(settings.value.logoVersion)
    ready.value = true
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  function regenerateBatch() {
    options.value.batchId = newBatchId()
    options.value.seed = newSeed()
  }

  function resetDesign() {
    design.value = defaultDesign({
      title: settings.value.title,
      accent: activeSet.value?.color,
    })
    void images.syncLogo(settings.value.logoVersion)
    toast.add({ title: 'Diseño restablecido', color: 'neutral', icon: 'i-lucide-rotate-ccw' })
  }

  function exportDesign() {
    const title = design.value.header.center.type === 'text' ? design.value.header.center.text : ''
    downloadJson(
      { type: DESIGN_FILE_TYPE, version: 1, design: design.value, sheet: options.value.sheet },
      `diseno-${slugify(title) || 'carton'}.json`
    )
  }

  async function importDesign() {
    const file = await pickFile('.json,application/json')
    if (!file) return
    try {
      const data = JSON.parse(await readFileText(file)) as Record<string, unknown> | null
      const raw =
        data && data.type === DESIGN_FILE_TYPE
          ? data.design
          : data && typeof data.width === 'number' && typeof data.grid === 'object'
            ? data
            : null
      if (!raw || typeof raw !== 'object') throw new Error('not a design')
      design.value = sanitizeDesign(raw)
      if (data?.type === DESIGN_FILE_TYPE && data.sheet)
        options.value.sheet = sanitizeSheet(data.sheet, options.value.sheet)
      void images.syncLogo(settings.value.logoVersion)
      toast.add({
        title: 'Diseño importado',
        description: file.name,
        color: 'success',
        icon: 'i-lucide-file-input',
      })
    } catch {
      toast.add({
        title: 'No se pudo importar el diseño',
        description: 'El archivo no es un diseño de cartón exportado desde este generador.',
        color: 'error',
        icon: 'i-lucide-circle-x',
      })
    }
  }

  /** Paints the set colour where the default design uses the accent colour. */
  function applySetColor() {
    const color = activeSet.value?.color
    if (!color) return
    design.value.grid.emptyColor = color
    design.value.grid.freeColor = color
    design.value.back.background = color
  }

  onBeforeUnmount(images.dispose)

  return {
    ready,
    settings,
    design,
    options,
    localSet,
    storageProblem,
    sets,
    activeSet,
    items,
    format,
    spec,
    specErrors,
    imposition,
    printPlan,
    fonts,
    images,
    preview,
    exporter,
    defaultBatchName,
    canGenerate,
    init,
    regenerateBatch,
    resetDesign,
    exportDesign,
    importDesign,
    applySetColor,
  }
}

export type Generator = ReturnType<typeof createGenerator>

const GENERATOR_KEY: InjectionKey<Generator> = Symbol('generator')

export function provideGenerator(generator: Generator): void {
  provide(GENERATOR_KEY, generator)
}

/** The generator state provided by the generator page. */
export function useGenerator(): Generator {
  const generator = inject(GENERATOR_KEY)
  if (!generator) throw new Error('useGenerator() must be used inside the generator page')
  return generator
}
