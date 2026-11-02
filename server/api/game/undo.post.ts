import type { LiveState } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<LiveState> => {
  await requireAdmin(event)

  const { state } = await mutateLive(async () => {
    const game = await requireRunningGame()
    if (!game.draws.length) throw apiError(409, 'Todavía no ha salido ningún elemento.')
    game.draws.pop()
    await writeGame(game)
  })
  return state
})
