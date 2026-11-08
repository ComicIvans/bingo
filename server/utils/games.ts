import { randomCode } from '#shared/cards/random'
import type { GameRecord, GameSummary, LiveGame } from '#shared/types/api'

/** Sortable, URL-safe id: base-36 start time plus a random suffix. */
export function newGameId(): string {
  return `${Date.now().toString(36)}-${randomCode(6).toLowerCase()}`
}

export function summarizeGame(game: GameRecord): GameSummary {
  return {
    id: game.id,
    name: game.name,
    setId: game.set.id,
    setName: game.set.name,
    color: game.set.color,
    status: game.status,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    drawCount: game.draws.length,
    total: game.set.items.length,
    lines: game.announcements.filter((a) => a.kind === 'line').length,
    bingos: game.announcements.filter((a) => a.kind === 'bingo').length,
    batchIds: (game.batches ?? []).map((batch) => batch.id),
  }
}

export function toLiveGame(game: GameRecord): LiveGame {
  const byIndex = new Map(game.set.items.map((item) => [item.index, item]))
  return {
    id: game.id,
    name: game.name,
    setId: game.set.id,
    setName: game.set.name,
    color: game.set.color,
    publicDisplay: game.publicDisplay,
    status: game.status,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    total: game.set.items.length,
    items: game.set.items,
    draws: game.draws.flatMap((draw) => {
      const item = byIndex.get(draw.index)
      return item ? [{ ...item, at: draw.at }] : []
    }),
    batches: game.batches ?? [],
  }
}

/** The game on the live screens (running or just finished), or null. */
export async function readCurrentGame(): Promise<GameRecord | null> {
  const id = await readCurrentGameId()
  return id ? readGame(id) : null
}

/** The running game, or a 409 when there is none. */
export async function requireRunningGame(): Promise<GameRecord> {
  const game = await readCurrentGame()
  if (!game || game.status !== 'running') throw apiError(409, 'No hay ninguna partida en curso.')
  return game
}

/** Every game, newest first. */
export async function listGames(): Promise<GameRecord[]> {
  const games = await readAllGames()
  return games.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
}
