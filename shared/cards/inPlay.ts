// Which card batches are in play by default when a game starts. Shared by the
// server (a start without batchIds) and the panel's start form, so the form
// shows exactly what the server would pick.

export interface BatchInfo {
  id: string
  setId: string
  /** ISO timestamp. */
  createdAt: string
}

export interface PastGame {
  setId: string
  /** ISO timestamp. */
  startedAt: string
  batchIds: readonly string[]
}

/** Batches made within this time of the newest one count as one print run. */
const PRINT_RUN_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Default batches for a new game of `setId`, newest first. With an earlier
 * game of the same set, its batches (the printed cards are still around, as in
 * a second game of the evening) plus any made since. Without one, or when that
 * leaves nothing, the newest batch of the set and those of its print run.
 */
export function defaultBatchIds(
  setId: string,
  batches: readonly BatchInfo[],
  games: readonly PastGame[]
): string[] {
  const candidates = batches
    .filter((batch) => batch.setId === setId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
  if (!candidates.length) return []

  const previous = games
    .filter((game) => game.setId === setId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (previous) {
    const kept = new Set(previous.batchIds)
    const chosen = candidates.filter(
      (batch) => kept.has(batch.id) || batch.createdAt > previous.startedAt
    )
    if (chosen.length) return chosen.map((batch) => batch.id)
  }

  const newest = Date.parse(candidates[0]!.createdAt)
  return candidates
    .filter((batch) => newest - Date.parse(batch.createdAt) <= PRINT_RUN_MS)
    .map((batch) => batch.id)
}
