import type { GameSummary } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<GameSummary[]> => {
  await requireAdmin(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return (await listGames()).map(summarizeGame)
})
