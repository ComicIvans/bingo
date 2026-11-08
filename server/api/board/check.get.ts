import type { BoardCheckResult } from '#shared/types/api'

// Card check for the volunteers' board, without the panel key: read-only,
// only against the game on the screens and only for cards of its set.
export default defineEventHandler(async (event): Promise<BoardCheckResult> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const settings = await readSettings()
  if (!settings.boardCheck)
    throw apiError(403, 'La comprobación de cartones desde el tablero está desactivada.')
  const game = await readCurrentGame()
  if (!game) throw apiError(409, 'Todavía no hay ninguna partida.')

  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code.slice(0, 40) : ''
  const result = await checkCardCode(code, game, { onlySetId: game.set.id })
  return {
    code: result.code,
    number: result.number,
    cells: result.cells,
    labels: result.labels,
    check: result.check,
    batchInPlay: result.batchInPlay,
    game: { name: game.name, drawCount: game.draws.length },
  }
})
