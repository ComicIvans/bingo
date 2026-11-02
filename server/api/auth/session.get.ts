import type { SessionInfo } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<SessionInfo> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { authenticated: await isAdmin(event), configured: isPanelConfigured() }
})
