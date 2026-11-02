import type { CardBatchSummary } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<CardBatchSummary[]> => {
  await requireAdmin(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return (await listBatches()).map(summarizeBatch)
})
