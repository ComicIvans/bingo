import { randomUUID } from 'node:crypto'
import { cardCode, parseCardCode } from '#shared/cards/grid'
import type { Announcement, LiveState } from '#shared/types/api'

/** The code as printed on the card (padding depends on the batch size). */
async function canonicalCardCode(input: string): Promise<string> {
  const parsed = parseCardCode(input)
  const batch = parsed ? await readBatch(parsed.batchId) : null
  if (!parsed || !batch) return input
  return cardCode(batch.id, parsed.number, batch.firstNumber + batch.count - 1)
}

export default defineEventHandler(async (event): Promise<LiveState> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, announceSchema)
  if (body.cardCode) body.cardCode = await canonicalCardCode(body.cardCode)

  const { state } = await mutateLive(async () => {
    const current = await readCurrentGame()
    const running = current?.status === 'running' ? current : null
    // A message can go up between games; lines and bingos belong to one.
    if (!running && body.kind !== 'message') throw apiError(409, 'No hay ninguna partida en curso.')

    const announcement: Announcement = {
      id: randomUUID(),
      kind: body.kind,
      ...(body.text ? { text: body.text } : {}),
      ...(body.cardCode ? { cardCode: body.cardCode } : {}),
      at: new Date().toISOString(),
    }
    if (running) {
      running.announcements.push(announcement)
      await writeGame(running)
    }
    await writeAnnouncement(announcement)
  })
  return state
})
