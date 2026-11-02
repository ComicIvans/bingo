import type { LiveState } from '#shared/types/api'

// Hides the announcement from the public screen (the game keeps it in its log).
export default defineEventHandler(async (event): Promise<LiveState> => {
  await requireAdmin(event)
  const { state } = await mutateLive(() => writeAnnouncement(null))
  return state
})
