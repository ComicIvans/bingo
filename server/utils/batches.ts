import {
  CardGenerationError,
  generateBatch,
  gridSpecFor,
  regenerateCard,
  validateSpec,
  type CardCells,
  type CardFormat,
  type GeneratedCard,
} from '#shared/cards/grid'
import type { CardBatch, CardBatchSummary } from '#shared/types/api'

export function summarizeBatch(batch: CardBatch): CardBatchSummary {
  return {
    id: batch.id,
    name: batch.name,
    createdAt: batch.createdAt,
    format: batch.format,
    setId: batch.setId,
    setName: batch.setName,
    count: batch.count,
    firstNumber: batch.firstNumber,
  }
}

/** Throws a 400 when the format cannot make cards from `itemCount` items. */
export function assertFormatFits(format: CardFormat, itemCount: number) {
  const problems = validateSpec(gridSpecFor(format), itemCount)
  if (problems.length) throw apiError(400, problems[0]!)
}

/** Every batch, newest first. */
export async function listBatches(): Promise<CardBatch[]> {
  const batches = await readAllBatches()
  return batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

// Rebuilding a card means generating every card before it, so checks during
// a game reuse the whole batch once it is built.
const MAX_CACHED_BATCHES = 4
const cardCache = new Map<string, GeneratedCard[]>()

function cacheKey(batch: CardBatch) {
  return `${batch.id}:${batch.seed}`
}

export function forgetBatchCards(batchId: string) {
  for (const key of cardCache.keys()) if (key.startsWith(`${batchId}:`)) cardCache.delete(key)
}

/**
 * Rebuilds card `number` of a batch exactly as the generator printed it:
 * same seed, format, item indices (in stored order) and first number.
 */
export function rebuildCard(batch: CardBatch, number: number): CardCells | null {
  const position = number - batch.firstNumber
  if (position < 0 || position >= batch.count) return null
  const params = {
    seed: batch.seed,
    spec: gridSpecFor(batch.format),
    indices: batch.items.map((item) => item.index),
    firstNumber: batch.firstNumber,
  }

  const key = cacheKey(batch)
  let cards = cardCache.get(key)
  if (!cards) {
    try {
      cards = generateBatch({ ...params, count: batch.count })
    } catch (error) {
      if (!(error instanceof CardGenerationError)) throw error
      // The whole batch cannot be rebuilt (an imported file asking for too
      // many cards); the cards before the failing one still can.
      try {
        return regenerateCard(params, number)?.cells ?? null
      } catch (retryError) {
        if (retryError instanceof CardGenerationError) return null
        throw retryError
      }
    }
    cardCache.set(key, cards)
    while (cardCache.size > MAX_CACHED_BATCHES) cardCache.delete(cardCache.keys().next().value!)
  } else {
    // Most recently used last.
    cardCache.delete(key)
    cardCache.set(key, cards)
  }
  return cards[position]?.cells ?? null
}
