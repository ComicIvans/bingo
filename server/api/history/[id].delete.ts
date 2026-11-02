export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = routeParam(event, 'id', GAME_ID_PATTERN, 'No existe esa partida.')

  await mutateLive(async () => {
    const game = await readGame(id)
    if (!game) throw apiError(404, 'No existe esa partida.')
    if (game.status === 'running')
      throw apiError(409, 'No se puede borrar la partida en curso. Termínala primero.')
    await removeGame(id)

    // The last finished game is still on the live screens: clear them.
    if ((await readCurrentGameId()) === id) {
      await writeCurrentGameId(null)
      await writeAnnouncement(null)
    }
  })
  return sendNoContent(event, 204)
})
