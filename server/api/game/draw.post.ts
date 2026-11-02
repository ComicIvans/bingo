import { randomInt } from 'node:crypto'
import type { DrawnItem, DrawResult } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<DrawResult> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, drawSchema)

  const { result: item, state } = await mutateLive(async (): Promise<DrawnItem> => {
    const game = await requireRunningGame()
    const drawn = new Set(game.draws.map((draw) => draw.index))
    const undrawn = game.set.items.filter((item) => !drawn.has(item.index))
    if (!undrawn.length) throw apiError(409, 'Ya han salido todos los elementos.')

    let picked
    if (body.index === undefined) {
      picked = undrawn[randomInt(undrawn.length)]!
    } else {
      // Marked by hand (a physical drum).
      picked = game.set.items.find((item) => item.index === body.index)
      if (!picked) throw apiError(400, 'Ese elemento no está en el conjunto de la partida.')
      if (drawn.has(picked.index)) throw apiError(409, 'Ese elemento ya ha salido.')
    }

    const at = new Date().toISOString()
    game.draws.push({ index: picked.index, at })
    await writeGame(game)
    await writeAnnouncement(null)
    return { ...picked, at }
  })
  return { item, state }
})
