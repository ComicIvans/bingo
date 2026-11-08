import type { GameRecord, LiveState } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<LiveState> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, startGameSchema)

  const { state } = await mutateLive(async () => {
    const set = await findSet(body.setId)
    if (!set) throw apiError(404, 'No existe ese conjunto. Puede que se haya borrado.')
    if (!set.items.length) throw apiError(400, 'Ese conjunto no tiene elementos.')

    const now = new Date().toISOString()
    const current = await readCurrentGame()
    if (current?.status === 'running') {
      if (!body.force)
        throw apiError(
          409,
          `La partida «${current.name}» sigue en curso. Termínala antes de empezar otra.`
        )
      await writeGame({ ...current, status: 'finished', finishedAt: now })
    }

    const batches = await resolveGameBatches(set.id, body.batchIds)
    const game: GameRecord = {
      id: newGameId(),
      name: body.name,
      // A copy, so editing or deleting the set later does not change history.
      set: {
        id: set.id,
        name: set.name,
        color: set.color,
        items: set.items.map((item) => ({ ...item })),
      },
      publicDisplay: body.publicDisplay ?? set.publicDisplay,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      draws: [],
      announcements: [],
      batches,
    }
    await writeGame(game)
    await writeCurrentGameId(game.id)
    await writeAnnouncement(null)
  })
  return state
})
