import type { BingoSet } from '#shared/types/bingo'

export default defineEventHandler(async (event): Promise<BingoSet> => {
  const id = routeParam(event, 'id', SET_ID_PATTERN, 'No existe ese conjunto.')
  const set = await findSet(id)
  if (!set) throw apiError(404, 'No existe ese conjunto.')
  return set
})
