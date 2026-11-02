import type { CardBatch, CardBatchSummary } from '#shared/types/api'
import type { BingoItem } from '#shared/types/bingo'

// Registers a batch printed by the generator, so its cards can be checked.
export default defineEventHandler(async (event): Promise<CardBatchSummary> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, registerBatchSchema)

  const { result: batch } = await mutateLive(async () => {
    if (await readBatch(body.id))
      throw apiError(
        409,
        `Ya existe un lote con el código ${body.id}. Vuelve a generar los cartones para obtener otro código.`
      )
    // Same seed means the same cards: a second batch would duplicate them.
    if ((await listBatches()).some((batch) => batch.seed === body.seed))
      throw apiError(
        409,
        'Ya hay un lote registrado con estos mismos cartones. Vuelve a generar los cartones para obtener un lote nuevo.'
      )

    let items: BingoItem[]
    let setName: string
    const set = await findSet(body.setId)
    if (set) {
      // The cards were drawn from the generator's copy of the set: if it no
      // longer matches the server's, they could not be checked.
      if (body.items && !sameItems(body.items, set.items))
        throw apiError(
          422,
          `El conjunto «${set.name}» ha cambiado desde que se generaron los cartones. Vuelve a generarlos.`
        )
      items = set.items
      setName = set.name
    } else {
      if (!body.items)
        throw apiError(400, 'Ese conjunto no está en el servidor: envía también sus elementos.')
      items = body.items
      setName = body.setName || body.setId
    }
    assertFormatFits(body.format, items.length)

    const created: CardBatch = {
      id: body.id,
      name: body.name || `Lote ${body.id}`,
      createdAt: new Date().toISOString(),
      seed: body.seed,
      format: body.format,
      setId: body.setId,
      setName,
      items: items.map((item) => ({ index: item.index, label: item.label, name: item.name })),
      count: body.count,
      firstNumber: body.firstNumber,
    }
    await writeBatch(created)
    return created
  })

  setResponseStatus(event, 201)
  return summarizeBatch(batch)
})

function sameItems(a: BingoItem[], b: BingoItem[]) {
  return (
    a.length === b.length &&
    a.every((item, i) => item.index === b[i]!.index && item.label === b[i]!.label)
  )
}
