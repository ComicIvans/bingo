import type { Settings } from '#shared/types/api'

// Goes back to the default logo.
export default defineEventHandler(async (event): Promise<Settings> => {
  await requireAdmin(event)

  const { result } = await mutateLive(async () => {
    await removeLogo()
    const settings = await readSettings()
    const next: Settings = {
      ...settings,
      hasCustomLogo: false,
      logoVersion: settings.logoVersion + 1,
    }
    await writeSettings(next)
    return next
  })
  return result
})
