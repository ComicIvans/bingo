import type { BingoSet } from '#shared/types/bingo'

export default defineEventHandler(async (event): Promise<BingoSet> => {
  await requireAdmin(event)
  const id = routeParam(event, 'id', SET_ID_PATTERN, 'No existe ese conjunto.')
  if (isBuiltinSetId(id))
    throw apiError(403, 'Los conjuntos incluidos no se pueden modificar. Crea una copia y edítala.')
  const body = await readBodyWith(event, setBodySchema)

  const { result } = await mutateLive(async () => {
    if (!(await readCustomSet(id))) throw apiError(404, 'No existe ese conjunto.')
    // Games keep their own copy of the set, so editing it does not alter them.
    const set = buildSet(id, body)
    await writeCustomSet(set)
    return set
  })
  return result
})
