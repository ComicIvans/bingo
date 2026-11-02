import { checkCard } from '#shared/cards/check'
import { cardCode, parseCardCode } from '#shared/cards/grid'
import type { CardCheckResult, GameRecord } from '#shared/types/api'

// Rebuilds a printed card from its code and checks it against the draws of
// the given game, or of the game on the live screens.
export default defineEventHandler(async (event): Promise<CardCheckResult> => {
  await requireAdmin(event)
  const query = getQuery(event)

  const parsed = parseCardCode(typeof query.code === 'string' ? query.code : '')
  if (!parsed) throw apiError(400, 'Escribe un código de cartón válido, por ejemplo K3F9-042.')

  const batch = await readBatch(parsed.batchId)
  if (!batch) throw apiError(404, `No existe ningún lote con el código ${parsed.batchId}.`)
  const lastNumber = batch.firstNumber + batch.count - 1
  if (parsed.number < batch.firstNumber || parsed.number > lastNumber)
    throw apiError(
      404,
      `El lote ${batch.id} no tiene el cartón ${parsed.number}: sus cartones van del ${batch.firstNumber} al ${lastNumber}.`
    )

  const cells = rebuildCard(batch, parsed.number)
  if (!cells) throw apiError(422, 'No se ha podido reconstruir ese cartón con los datos del lote.')

  let game: GameRecord | null
  const gameId = typeof query.gameId === 'string' ? query.gameId.trim() : ''
  if (gameId) {
    game = GAME_ID_PATTERN.test(gameId) ? await readGame(gameId) : null
    if (!game) throw apiError(404, 'No existe esa partida.')
  } else game = await readCurrentGame()

  const drawn = new Set(game?.draws.map((draw) => draw.index) ?? [])
  const labelOf = new Map(batch.items.map((item) => [item.index, item.label]))
  const labels: Record<number, string> = {}
  for (const value of cells.flat())
    if (value > 0) labels[value] = labelOf.get(value) ?? String(value)

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    code: cardCode(batch.id, parsed.number, lastNumber),
    number: parsed.number,
    batch: summarizeBatch(batch),
    cells,
    labels,
    check: checkCard(cells, drawn),
    game: game
      ? { id: game.id, name: game.name, setId: game.set.id, drawCount: game.draws.length }
      : null,
    setMismatch: game ? game.set.id !== batch.setId : false,
  }
})
