import type { LiveState } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<LiveState> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, updateGameSchema)

  const { state } = await mutateLive(async () => {
    const game = await readCurrentGame()
    if (!game) throw apiError(409, 'No hay ninguna partida en pantalla.')
    if (body.name !== undefined) game.name = body.name
    if (body.publicDisplay !== undefined) game.publicDisplay = body.publicDisplay
    if (body.batchIds !== undefined)
      game.batches = await resolveGameBatches(game.set.id, body.batchIds)
    await writeGame(game)
  })
  return state
})
