export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = routeParam(event, 'id', SET_ID_PATTERN, 'No existe ese conjunto.')
  if (isBuiltinSetId(id)) throw apiError(403, 'Los conjuntos incluidos no se pueden borrar.')

  await mutateLive(async () => {
    if (!(await readCustomSet(id))) throw apiError(404, 'No existe ese conjunto.')
    await removeCustomSet(id)
  })
  return sendNoContent(event, 204)
})
