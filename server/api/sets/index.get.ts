import type { BingoSetSummary } from '#shared/types/bingo'

export default defineEventHandler((): Promise<BingoSetSummary[]> => listSetSummaries())
