import type { Settings } from '#shared/types/api'

// Removes the logo uploaded for one background. That background then shows
// the other one's upload, or the default logo.
export default defineEventHandler(async (event): Promise<Settings> => {
  await requireAdmin(event)
  const variant = requireLogoVariant(event)

  const { result } = await mutateLive(async () => {
    await removeLogo(variant)
    const settings = await readSettings()
    const next: Settings = {
      ...settings,
      [LOGO_FLAG[variant]]: false,
      logoVersion: settings.logoVersion + 1,
    }
    await writeSettings(next)
    return next
  })
  return result
})
