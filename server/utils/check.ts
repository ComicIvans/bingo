import { checkCard } from '#shared/cards/check'
import { cardCode, parseCardCode } from '#shared/cards/grid'
import type { CardCheckResult, GameRecord } from '#shared/types/api'

/**
 * Rebuilds a printed card from its code and checks it against the draws of
 * `game`. With `onlySetId`, cards of batches of any other set are refused
 * before anything is rebuilt (the board's public check uses it, so anonymous
 * callers cannot make the server generate arbitrary batches).
 */
export async function checkCardCode(
  code: string,
  game: GameRecord | null,
  options: { onlySetId?: string } = {}
): Promise<CardCheckResult> {
  const parsed = parseCardCode(code)
  if (!parsed) throw apiError(400, 'Escribe un código de cartón válido, por ejemplo K3F9-042.')

  const batch = await readBatch(parsed.batchId)
  if (!batch) throw apiError(404, `No existe ningún lote con el código ${parsed.batchId}.`)
  if (options.onlySetId !== undefined && batch.setId !== options.onlySetId)
    throw apiError(
      422,
      `El lote ${batch.id} es del conjunto «${batch.setName}», no del de esta partida.`
    )
  const lastNumber = batch.firstNumber + batch.count - 1
  if (parsed.number < batch.firstNumber || parsed.number > lastNumber)
    throw apiError(
      404,
      `El lote ${batch.id} no tiene el cartón ${parsed.number}: sus cartones van del ${batch.firstNumber} al ${lastNumber}.`
    )

  const cells = rebuildCard(batch, parsed.number)
  if (!cells) throw apiError(422, 'No se ha podido reconstruir ese cartón con los datos del lote.')

  const drawn = new Set(game?.draws.map((draw) => draw.index) ?? [])
  const labelOf = new Map(batch.items.map((item) => [item.index, item.label]))
  const labels: Record<number, string> = {}
  for (const value of cells.flat())
    if (value > 0) labels[value] = labelOf.get(value) ?? String(value)

  const inPlay = game?.batches?.length ? game.batches.some((b) => b.id === batch.id) : null
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
    batchInPlay: inPlay,
  }
}
