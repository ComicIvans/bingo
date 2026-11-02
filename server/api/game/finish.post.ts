import type { LiveState } from '#shared/types/api'

// The finished game stays on the live screens until the next one starts.
export default defineEventHandler(async (event): Promise<LiveState> => {
  await requireAdmin(event)

  const { state } = await mutateLive(async () => {
    const game = await requireRunningGame()
    game.status = 'finished'
    game.finishedAt = new Date().toISOString()
    await writeGame(game)
  })
  return state
})
