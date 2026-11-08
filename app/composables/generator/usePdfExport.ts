import { usedImageIds, type CardDesign } from '#shared/cards/design'
import {
  ENGINE_VERSION,
  cardCode,
  generateBatch,
  type CardFormat,
  type GridSpec,
} from '#shared/cards/grid'
import type { Imposition, SheetOptions } from '#shared/cards/impose'
import { gridFontSize, layoutBack, layoutFront, type DrawOp } from '#shared/cards/layout'
import type { PdfImageAsset } from '#shared/cards/pdf'
import type { TextEngine } from '#shared/cards/text'
import type { CardBatch, CardBatchSummary, RegisterBatchBody, SessionInfo } from '#shared/types/api'
import type { BingoItem, BingoSet } from '#shared/types/bingo'
import type { PdfJobPhase, PdfJobRequest, PdfWorkerMessage } from '~/workers/pdf-protocol'
import { apiMessage, apiStatus, errorText } from '~/utils/generator/errors'
import { downloadBlob, downloadJson, hashString } from '~/utils/generator/files'
import { imageDrawWidths, jpegOrientation, rasterSize, rasterize } from '~/utils/generator/images'
import { lastNumberOf, newBatchId, newSeed, type GeneratorOptions } from '~/utils/generator/options'
import type { FontEngine } from './useFontEngine'
import type { ImageLibrary } from './useImageLibrary'

// PDF download: registers the batch in the panel when there is a session,
// prepares fonts and images on the main thread and renders in a worker.
// Everything works on a snapshot taken once the fonts match the design, so
// edits made while the PDF is being built cannot mix two designs.

export interface ActiveSet {
  /** Server id, or `local-<slug>` for a set imported in this browser. */
  id: string
  name: string
  color: string
  items: BingoItem[]
  local: boolean
}

export interface ExportSource {
  design: Ref<CardDesign>
  options: Ref<GeneratorOptions>
  activeSet: ComputedRef<ActiveSet | null>
  format: ComputedRef<CardFormat>
  spec: ComputedRef<GridSpec>
  imposition: ComputedRef<Imposition | { error: string }>
  fonts: FontEngine
  images: ImageLibrary
  /** Default batch name when the field is empty. */
  defaultBatchName: ComputedRef<string>
  /** Fetches a server set again, bypassing the cache (and shows it if selected). */
  refreshSet: (id: string) => Promise<BingoSet>
}

export type ExportStatus = 'idle' | 'registering' | 'preparing' | 'generating'

interface Snapshot {
  design: CardDesign
  spec: GridSpec
  format: CardFormat
  set: ActiveSet
  /** Generator version, fixed with the snapshot like everything else. */
  engineVersion: number
  seed: string
  batchId: string
  batchName: string
  count: number
  firstNumber: number
  sheet: SheetOptions
  perPage: number
  testPrint: boolean
  engine: TextEngine
  fonts: [string, ArrayBuffer][]
}

const MAX_ID_ATTEMPTS = 8

/** Same items in the same order (what the cards are built from). */
function sameItems(a: readonly BingoItem[], b: readonly BingoItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => item.index === b[i]!.index && item.label === b[i]!.label)
  )
}

/**
 * Identity of a registered batch, apart from its id. It includes the
 * generator version: after an update the same options make other cards.
 */
function registrationKey(
  seed: string,
  format: CardFormat,
  set: ActiveSet | null,
  count: number,
  firstNumber: number
): string {
  return hashString(
    JSON.stringify([
      ENGINE_VERSION,
      seed,
      format,
      set?.id,
      count,
      firstNumber,
      set?.items.map((item) => `${item.index}:${item.label}`),
    ])
  )
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function usePdfExport(source: ExportSource) {
  const { design, options, activeSet, format, spec, imposition, fonts, images } = source
  const toast = useToast()

  const session = ref<SessionInfo | null>(null)
  const status = ref<ExportStatus>('idle')
  const progress = ref<{ phase: PdfJobPhase; done: number; total: number } | null>(null)
  let worker: Worker | null = null
  let abortWorker: (() => void) | null = null
  /** Increases on every download and on cancel; stale runs stop at their next step. */
  let run = 0

  const busy = computed(() => status.value !== 'idle')
  const authenticated = computed(() => !!session.value?.authenticated)

  /** Fresh session, or null when the server did not answer (the last known one is kept). */
  async function refreshSession(): Promise<SessionInfo | null> {
    try {
      session.value = await $fetch<SessionInfo>('/api/auth/session')
      return session.value
    } catch {
      return null
    }
  }

  const isRegistered = computed(() => {
    const o = options.value
    return (
      o.registered?.id === o.batchId &&
      o.registered.key ===
        registrationKey(o.seed, format.value, activeSet.value, o.count, o.firstNumber)
    )
  })

  function batchName(): string {
    return options.value.batchName.trim() || source.defaultBatchName.value
  }

  /** Full batch file, importable in the panel. */
  function batchFile(): CardBatch | null {
    const set = activeSet.value
    if (!set) return null
    const o = options.value
    return {
      id: o.batchId,
      name: batchName(),
      createdAt: new Date().toISOString(),
      seed: o.seed,
      engineVersion: ENGINE_VERSION,
      format: format.value,
      setId: set.id,
      setName: set.name,
      items: set.items,
      count: o.count,
      firstNumber: o.firstNumber,
    }
  }

  function downloadBatchFile(): void {
    const batch = batchFile()
    if (!batch) return
    downloadJson(batch, `lote-${batch.id}.json`)
  }

  function registrationFailed(description: string): 'failed' {
    toast.add({
      title: 'No se pudo registrar el lote',
      description,
      color: 'error',
      icon: 'i-lucide-circle-x',
      actions: [
        {
          label: 'Generar sin registrar',
          color: 'neutral',
          variant: 'outline',
          onClick: () => void generate({ skipRegistration: true }),
        },
      ],
    })
    return 'failed'
  }

  /**
   * The server registers a server set with its current items. Sets are cached
   * for the whole visit, so make sure the panel has not edited this one since:
   * otherwise the printed cards could not be checked.
   */
  async function setIsCurrent(snap: Snapshot): Promise<'yes' | 'changed' | 'failed'> {
    if (snap.set.local) return 'yes'
    let fresh: BingoSet
    try {
      fresh = await source.refreshSet(snap.set.id)
    } catch (e) {
      registrationFailed(apiMessage(e, 'No se pudo comprobar el conjunto en el servidor.'))
      return 'failed'
    }
    if (sameItems(fresh.items, snap.set.items)) return 'yes'
    toast.add({
      title: 'El conjunto ha cambiado en el panel',
      description: `«${fresh.name}» se ha modificado desde que abriste el generador. La vista previa ya muestra sus elementos actuales: revísala y vuelve a generar el PDF.`,
      color: 'warning',
      icon: 'i-lucide-refresh-cw',
      duration: 10_000,
    })
    return 'changed'
  }

  /**
   * Registers the batch. A 409 means the id or the seed is already in use
   * (almost always by a batch this browser registered before), so both change:
   * reusing a seed would print the same cards as that batch under other codes.
   */
  async function register(snap: Snapshot): Promise<'registered' | 'skipped' | 'failed'> {
    const key = registrationKey(snap.seed, snap.format, snap.set, snap.count, snap.firstNumber)
    const previous = options.value.registered
    if (previous?.id === snap.batchId && previous.key === key) return 'skipped'

    if ((await setIsCurrent(snap)) !== 'yes') return 'failed'

    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const body: RegisterBatchBody = {
        id: snap.batchId,
        name: snap.batchName,
        seed: snap.seed,
        engineVersion: snap.engineVersion,
        format: snap.format,
        setId: snap.set.id,
        count: snap.count,
        firstNumber: snap.firstNumber,
        ...(snap.set.local ? { items: snap.set.items, setName: snap.set.name } : {}),
      }
      try {
        const summary = await $fetch<CardBatchSummary>('/api/batches', { method: 'POST', body })
        snap.batchId = summary.id
        // The form shows this batch unless the cards were changed meanwhile.
        if (options.value.seed === snap.seed) options.value.batchId = summary.id
        options.value.registered = { id: summary.id, key }
        toast.add({
          title: `Lote ${summary.id} registrado`,
          description: 'Los cartones se podrán comprobar desde el panel.',
          color: 'success',
          icon: 'i-lucide-badge-check',
        })
        return 'registered'
      } catch (e) {
        const code = apiStatus(e)
        if (code === 409) {
          const sameCards = options.value.seed === snap.seed
          snap.batchId = newBatchId()
          snap.seed = newSeed()
          if (sameCards) {
            options.value.batchId = snap.batchId
            options.value.seed = snap.seed
          }
          continue
        }
        if (code === 401) {
          session.value = { configured: session.value?.configured ?? true, authenticated: false }
          toast.add({
            title: 'La sesión del panel ha caducado',
            description:
              'El PDF se generará sin registrar el lote. Descarga la ficha del lote para importarla en el panel.',
            color: 'warning',
            icon: 'i-lucide-log-out',
          })
          return 'skipped'
        }
        return registrationFailed(apiMessage(e, 'El servidor no respondió. Inténtalo de nuevo.'))
      }
    }
    toast.add({
      title: 'No se pudo registrar el lote',
      description: 'No se encontró un identificador libre. Inténtalo de nuevo.',
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
    return 'failed'
  }

  /** Display lists of the first card, to know how large each image is drawn. */
  function sampleOps(snap: Snapshot): DrawOp[][] {
    const [card] = generateBatch({
      engine: snap.engineVersion,
      seed: snap.seed,
      spec: snap.spec,
      indices: snap.set.items.map((item) => item.index),
      count: 1,
      firstNumber: snap.firstNumber,
    })
    if (!card) return []
    const labels = new Map(snap.set.items.map((item) => [item.index, item.label]))
    const code = cardCode(snap.batchId, card.number, lastNumberOf(snap))
    const fontSize = gridFontSize(snap.design, snap.spec, [...labels.values()], snap.engine)
    const lists = [
      layoutFront(
        { design: snap.design, spec: snap.spec, cells: card.cells, labels, code, fontSize },
        snap.engine
      ),
    ]
    if (snap.design.back.enabled) lists.push(layoutBack(snap.design, code, snap.engine))
    return lists
  }

  /**
   * PNG/JPEG bytes for every image the cards draw. SVG, WebP and rotated
   * JPEGs (pdf-lib ignores EXIF orientation) are redrawn through a canvas.
   */
  async function prepareImages(snap: Snapshot): Promise<[string, PdfImageAsset][]> {
    const widths = imageDrawWidths(...sampleOps(snap))
    const assets: [string, PdfImageAsset][] = []
    const failed: string[] = []
    for (const id of usedImageIds(snap.design)) {
      const boxWidth = widths.get(id)
      const image = snap.design.images[id]
      if (!boxWidth || !image) continue
      try {
        const data = await images.read(image)
        if (!data) throw new Error('unknown format')
        if (data.kind === 'png' || (data.kind === 'jpg' && jpegOrientation(data.bytes) === 1)) {
          assets.push([id, { bytes: data.bytes, type: data.kind }])
          continue
        }
        const aspect = image.width / image.height
        const natural = data.kind === 'svg' ? null : { width: image.width, height: image.height }
        const size = rasterSize(boxWidth, aspect, natural)
        // Photos stay JPEG; drawings become PNG to keep transparency.
        const type = data.kind === 'jpg' ? 'jpg' : 'png'
        const bytes = await rasterize(data.bytes, data.kind, size.width, size.height, type)
        assets.push([id, { bytes, type }])
      } catch {
        failed.push(image.name)
      }
    }
    if (failed.length)
      toast.add({
        title: 'Algunas imágenes no se han podido incluir',
        description: `El PDF saldrá sin: ${failed.join(', ')}.`,
        color: 'warning',
        icon: 'i-lucide-image-off',
      })
    return assets
  }

  function runWorker(request: PdfJobRequest): Promise<{ pdf: Uint8Array; pages: number }> {
    let pages = 0
    return new Promise((resolve, reject) => {
      abortWorker = () => reject(new Error('cancelled'))
      worker = new Worker(new URL('../../workers/pdf.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.addEventListener('message', (event: MessageEvent<PdfWorkerMessage>) => {
        const message = event.data
        if (message.type === 'progress') {
          progress.value = { phase: message.phase, done: message.done, total: message.total }
          if (message.phase === 'pages') pages = message.total
        } else if (message.type === 'done') resolve({ pdf: message.pdf, pages })
        else reject(new Error(message.message))
      })
      worker.addEventListener('error', (event) => {
        event.preventDefault()
        reject(new Error('El generador de PDF se ha detenido de forma inesperada.'))
      })
      worker.postMessage(request)
    })
  }

  function stopWorker() {
    worker?.terminate()
    worker = null
    abortWorker = null
  }

  /**
   * Throws when the batch cannot hold `count` distinct cards, before anything
   * is registered (a batch of 2000 cards takes well under 100 ms).
   */
  function checkFeasible(snap: Snapshot) {
    generateBatch({
      engine: snap.engineVersion,
      seed: snap.seed,
      spec: snap.spec,
      indices: snap.set.items.map((item) => item.index),
      count: snap.count,
      firstNumber: snap.firstNumber,
    })
  }

  /** Waits for the fonts to match the design, then copies everything the job needs. */
  async function takeSnapshot(alive: () => boolean): Promise<Snapshot | null> {
    let engine = await fonts.settled()
    while (alive() && fonts.loading.value) engine = await fonts.settled()
    if (!alive()) return null
    if (!engine) throw new Error('No se pudieron cargar las fuentes.')
    const set = activeSet.value
    const imp = imposition.value
    if (!set) throw new Error('Elige un conjunto.')
    if ('error' in imp) throw new Error(imp.error)
    const o = options.value
    return {
      design: clone(design.value),
      spec: { ...spec.value },
      format: clone(format.value),
      set: clone(set),
      engineVersion: ENGINE_VERSION,
      seed: o.seed,
      batchId: o.batchId,
      batchName: batchName(),
      count: o.count,
      firstNumber: o.firstNumber,
      sheet: { ...o.sheet },
      perPage: imp.perPage,
      testPrint: o.firstSheetOnly,
      engine,
      fonts: fonts.engineFonts(),
    }
  }

  async function generate(opts: { skipRegistration?: boolean } = {}): Promise<void> {
    if (busy.value || !activeSet.value || 'error' in imposition.value) return
    const mine = ++run
    const alive = () => mine === run
    status.value = 'preparing'
    progress.value = null
    try {
      const snap = await takeSnapshot(alive)
      if (!snap) return
      checkFeasible(snap)

      if (!snap.testPrint && !opts.skipRegistration) {
        status.value = 'registering'
        const wasAuthenticated = authenticated.value
        const info = await refreshSession()
        if (!alive()) return
        // A logged-in user should not lose the registration to a network blip.
        if (!info && wasAuthenticated) {
          registrationFailed('No se pudo contactar con el servidor. Inténtalo de nuevo.')
          return
        }
        if (info?.authenticated) {
          const result = await register(snap)
          if (result === 'failed' || !alive()) return
        }
      }

      status.value = 'preparing'
      const imageAssets = await prepareImages(snap)
      if (!alive()) return

      const count = snap.testPrint ? Math.min(snap.count, snap.perPage) : snap.count
      const request: PdfJobRequest = {
        // Layout only needs the images' sizes: their bytes travel in `images`
        // and the fonts' in `fonts`, so the data URLs are not copied again.
        design: {
          ...snap.design,
          images: Object.fromEntries(
            Object.entries(snap.design.images).map(([id, image]) => [id, { ...image, src: '' }])
          ),
          customFonts: {},
        },
        spec: snap.spec,
        engine: snap.engineVersion,
        seed: snap.seed,
        indices: snap.set.items.map((item) => item.index),
        labels: snap.set.items.map((item) => [item.index, item.label]),
        batchId: snap.batchId,
        firstNumber: snap.firstNumber,
        count,
        // The whole batch's last number, also for a test print, so codes match.
        lastNumber: lastNumberOf(snap),
        sheet: snap.sheet,
        title: `${snap.batchName} (${snap.batchId})`,
        fonts: snap.fonts,
        images: imageAssets,
      }
      status.value = 'generating'
      const { pdf, pages } = await runWorker(request)
      if (!alive()) return
      downloadBlob(
        new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
        snap.testPrint ? `cartones-${snap.batchId}-prueba.pdf` : `cartones-${snap.batchId}.pdf`
      )
      // The next PDF is a new batch: a new seed keeps its cards from repeating
      // this one's (a test sheet keeps the batch, it is printed again later).
      const next = !snap.testPrint && options.value.seed === snap.seed
      if (next) {
        options.value.batchId = newBatchId()
        options.value.seed = newSeed()
      }
      toast.add({
        title: snap.testPrint ? 'Hoja de prueba descargada' : 'PDF descargado',
        description: `${count} ${count === 1 ? 'cartón' : 'cartones'}${pages ? `, ${pages} ${pages === 1 ? 'página' : 'páginas'}` : ''}.${next ? ` El próximo PDF será un lote nuevo (${options.value.batchId}).` : ''}`,
        color: 'success',
        icon: 'i-lucide-file-check',
      })
    } catch (e) {
      if (alive())
        toast.add({
          title: 'No se pudo generar el PDF',
          description: errorText(e, 'Ha ocurrido un error inesperado.'),
          color: 'error',
          icon: 'i-lucide-circle-x',
        })
    } finally {
      if (alive()) {
        stopWorker()
        status.value = 'idle'
        progress.value = null
      }
    }
  }

  function cancel(): void {
    if (!busy.value) return
    run++
    abortWorker?.()
    stopWorker()
    status.value = 'idle'
    progress.value = null
    toast.add({ title: 'Generación cancelada', color: 'neutral', icon: 'i-lucide-circle-slash' })
  }

  onBeforeUnmount(stopWorker)

  return {
    session,
    authenticated,
    status,
    progress,
    busy,
    isRegistered,
    refreshSession,
    generate,
    cancel,
    downloadBatchFile,
  }
}

export type PdfExport = ReturnType<typeof usePdfExport>
