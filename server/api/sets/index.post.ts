import type { BingoSet } from '#shared/types/bingo'

export default defineEventHandler(async (event): Promise<BingoSet> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, setBodySchema)

  const { result: set } = await mutateLive(async () => {
    const created = buildSet(await newSetId(body.name), body)
    await writeCustomSet(created)
    return created
  })
  setResponseStatus(event, 201)
  return set
})
