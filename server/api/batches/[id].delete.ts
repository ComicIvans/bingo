export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = (getRouterParam(event, 'id', { decode: true }) ?? '').toUpperCase()
  if (!BATCH_ID_PATTERN.test(id)) throw apiError(404, 'No existe ese lote.')

  await mutateLive(async () => {
    if (!(await readBatch(id))) throw apiError(404, 'No existe ese lote.')
    await removeBatch(id)
    forgetBatchCards(id)
  })
  return sendNoContent(event, 204)
})
