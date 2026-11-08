import type { CardBatch, CardBatchSummary } from '#shared/types/api'

// Imports a batch file saved by the generator (for instance, cards printed
// on another device or before the batch was registered).
export default defineEventHandler(async (event): Promise<CardBatchSummary> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, importBatchSchema)
  assertFormatFits(body.format, body.items.length)

  const {
    result: { batch, created },
  } = await mutateLive(async () => {
    const existing = await readBatch(body.id)
    if (existing) {
      // Importing the same file twice is harmless.
      if (existing.seed === body.seed) return { batch: existing, created: false }
      throw apiError(409, `Ya existe otro lote con el código ${body.id}.`)
    }
    const imported: CardBatch = {
      id: body.id,
      name: body.name || `Lote ${body.id}`,
      createdAt: body.createdAt,
      seed: body.seed,
      engineVersion: body.engineVersion,
      format: body.format,
      setId: body.setId,
      setName: body.setName || body.setId,
      items: body.items,
      count: body.count,
      firstNumber: body.firstNumber,
    }
    await writeBatch(imported)
    return { batch: imported, created: true }
  })

  setResponseStatus(event, created ? 201 : 200)
  return summarizeBatch(batch)
})
