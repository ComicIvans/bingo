import type { Settings } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<Settings> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return readSettings()
})
