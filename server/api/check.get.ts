import type { CardCheckResult, GameRecord } from '#shared/types/api'

// Rebuilds a printed card from its code and checks it against the draws of
// the given game, or of the game on the live screens.
export default defineEventHandler(async (event): Promise<CardCheckResult> => {
  await requireAdmin(event)
  const query = getQuery(event)

  let game: GameRecord | null
  const gameId = typeof query.gameId === 'string' ? query.gameId.trim() : ''
  if (gameId) {
    game = GAME_ID_PATTERN.test(gameId) ? await readGame(gameId) : null
    if (!game) throw apiError(404, 'No existe esa partida.')
  } else game = await readCurrentGame()

  const result = await checkCardCode(typeof query.code === 'string' ? query.code : '', game)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return result
})
