import type { Settings } from '#shared/types/api'

export default defineEventHandler(async (event): Promise<Settings> => {
  await requireAdmin(event)
  const body = await readBodyWith(event, settingsSchema)

  const { result } = await mutateLive(async () => {
    const settings: Settings = { ...(await readSettings()) }
    if (body.title !== undefined) settings.title = body.title
    if (body.subtitle !== undefined) settings.subtitle = body.subtitle
    if (body.publicTheme !== undefined) settings.publicTheme = body.publicTheme
    if (body.recentCount !== undefined) settings.recentCount = body.recentCount
    await writeSettings(settings)
    return settings
  })
  return result
})
