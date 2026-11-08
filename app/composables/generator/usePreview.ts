import { useDebounceFn } from '@vueuse/core'
import type { CardDesign } from '#shared/cards/design'
import {
  ENGINE_VERSION,
  cardCode,
  generateBatch,
  type GeneratedCard,
  type GridSpec,
} from '#shared/cards/grid'
import { cropMarks, type Imposition, type Slot } from '#shared/cards/impose'
import { gridFontSize, layoutBack, layoutFront, type DrawOp } from '#shared/cards/layout'
import { escapeAttr, renderSvg, renderSvgBody } from '#shared/cards/svg'
import type { TextEngine } from '#shared/cards/text'
import type { BingoItem } from '#shared/types/bingo'
import { errorText } from '~/utils/generator/errors'
import { lastNumberOf, type GeneratorOptions } from '~/utils/generator/options'

// Live preview: the selected card (front and back) and the first sheet of the
// PDF. It uses the same seed, engine and layout as the PDF, and generates
// only the cards it shows.

export interface PreviewSource {
  design: Ref<CardDesign>
  options: Ref<GeneratorOptions>
  spec: ComputedRef<GridSpec>
  specErrors: ComputedRef<string[]>
  items: ComputedRef<BingoItem[]>
  imposition: ComputedRef<Imposition | { error: string }>
  engine: ShallowRef<TextEngine | null>
  imageHref: (imageId: string) => string | undefined
}

/** Prefix of the batch, extended on demand (card i only depends on the cards before it). */
function useCardCache() {
  let key = ''
  let cards: GeneratedCard[] = []
  return (params: Parameters<typeof generateBatch>[0]): GeneratedCard[] => {
    const nextKey = JSON.stringify([
      params.engine,
      params.seed,
      params.spec,
      params.indices,
      params.firstNumber,
    ])
    if (nextKey !== key || cards.length < params.count) {
      cards = generateBatch(params)
      key = nextKey
    }
    return cards.slice(0, params.count)
  }
}

export function usePreview(source: PreviewSource) {
  const { design, options, spec, specErrors, items, imposition, engine, imageHref } = source

  /** 1-based position of the previewed card in the batch. */
  const position = ref(1)
  /** The sheet preview is only built while it is on screen. */
  const sheetVisible = ref(false)

  const front = ref('')
  const back = ref('')
  const sheetFront = ref('')
  const sheetBack = ref('')
  const error = ref<string | null>(null)

  const number = computed(() => options.value.firstNumber + position.value - 1)
  const code = computed(() =>
    cardCode(options.value.batchId, number.value, lastNumberOf(options.value))
  )

  watch(
    () => options.value.count,
    (count) => {
      if (position.value > count) position.value = Math.max(1, count)
    }
  )

  const cardsFor = useCardCache()

  function sheetSvg(
    imp: Imposition,
    slots: Slot[],
    lists: DrawOp[][],
    textEngine: TextEngine,
    marks: boolean,
    label: string
  ): string {
    const { pageWidth: w, pageHeight: h } = imp
    let body = `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
    lists.forEach((ops, i) => {
      const slot = slots[i]!
      body += `<g transform="translate(${slot.x} ${slot.y})">${renderSvgBody(ops, textEngine, { imageHref })}</g>`
    })
    if (marks)
      for (const m of cropMarks(
        imp,
        design.value.width,
        design.value.height,
        options.value.sheet.gap
      ))
        body += `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="#000000" stroke-width="0.15"/>`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeAttr(label)}">${body}</svg>`
  }

  function render() {
    const textEngine = engine.value
    const set = items.value
    if (!textEngine || !set.length || specErrors.value.length) {
      front.value = back.value = sheetFront.value = sheetBack.value = ''
      error.value = null
      return
    }
    try {
      const d = design.value
      const o = options.value
      const imp = imposition.value
      const sheetCount =
        sheetVisible.value && !('error' in imp) && o.sheet.mode === 'sheet'
          ? Math.min(o.count, imp.perPage)
          : 0
      const cards = cardsFor({
        engine: ENGINE_VERSION,
        seed: o.seed,
        spec: spec.value,
        indices: set.map((item) => item.index),
        count: Math.max(position.value, sheetCount),
        firstNumber: o.firstNumber,
      })
      const labels = new Map(set.map((item) => [item.index, item.label]))
      const fontSize = gridFontSize(d, spec.value, [...labels.values()], textEngine)
      const lastNumber = lastNumberOf(o)
      const layoutCard = (card: GeneratedCard) =>
        layoutFront(
          {
            design: d,
            spec: spec.value,
            cells: card.cells,
            labels,
            code: cardCode(o.batchId, card.number, lastNumber),
            fontSize,
          },
          textEngine
        )

      const card = cards[position.value - 1]!
      const cardCodeText = cardCode(o.batchId, card.number, lastNumber)
      front.value = renderSvg(layoutCard(card), d.width, d.height, textEngine, {
        imageHref,
        attrs: `role="img" aria-label="${escapeAttr(`Anverso del cartón ${cardCodeText}`)}"`,
      })
      back.value = d.back.enabled
        ? renderSvg(layoutBack(d, cardCodeText, textEngine), d.width, d.height, textEngine, {
            imageHref,
            attrs: `role="img" aria-label="${escapeAttr(`Reverso del cartón ${cardCodeText}`)}"`,
          })
        : ''

      if (sheetCount && !('error' in imp)) {
        const first = cards.slice(0, sheetCount)
        sheetFront.value = sheetSvg(
          imp,
          imp.fronts,
          first.map(layoutCard),
          textEngine,
          o.sheet.cropMarks,
          'Primera página: anversos'
        )
        if (d.back.enabled) {
          const shared = d.back.showCode ? null : layoutBack(d, '', textEngine)
          sheetBack.value = sheetSvg(
            imp,
            imp.backs,
            first.map(
              (c) => shared ?? layoutBack(d, cardCode(o.batchId, c.number, lastNumber), textEngine)
            ),
            textEngine,
            false,
            'Segunda página: reversos'
          )
        } else sheetBack.value = ''
      } else sheetFront.value = sheetBack.value = ''
      error.value = null
    } catch (e) {
      error.value = errorText(e, 'No se pudo dibujar la vista previa.')
    }
  }

  const schedule = useDebounceFn(render, 150)
  watch([design, options, spec, items, position, sheetVisible, imposition], schedule, {
    deep: true,
  })
  // The engine holds fontkit objects: watched by identity only, never deeply.
  watch(engine, schedule)
  void schedule()

  return {
    position,
    sheetVisible,
    number,
    code,
    front,
    back,
    sheetFront,
    sheetBack,
    error,
  }
}

export type Preview = ReturnType<typeof usePreview>
