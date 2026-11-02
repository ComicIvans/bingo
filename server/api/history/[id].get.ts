import type { GameRecord } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<GameRecord> => {
  await requireAdmin(event)
  const id = routeParam(event, 'id', GAME_ID_PATTERN, 'No existe esa partida.')
  const game = await readGame(id)
  if (!game) throw apiError(404, 'No existe esa partida.')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return game
})
