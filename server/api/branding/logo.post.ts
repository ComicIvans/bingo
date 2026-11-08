import type { Settings } from '#shared/types/api'

const TOO_BIG = 'El logo no puede ocupar más de 2 MB.'

export default defineEventHandler(async (event): Promise<Settings> => {
  await requireAdmin(event)
  const variant = requireLogoVariant(event)

  // Refuse oversized uploads before reading them into memory (the form
  // adds a few bytes around the file).
  const declared = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (declared > LOGO_MAX_BYTES + 64 * 1024) throw apiError(413, TOO_BIG)

  let parts: Awaited<ReturnType<typeof readMultipartFormData>>
  try {
    parts = await readMultipartFormData(event)
  } catch {
    throw apiError(400, 'No se ha podido leer el archivo enviado.')
  }
  const file = parts?.find((part) => part.name === 'file' && part.data.byteLength > 0)
  if (!file) throw apiError(400, 'Elige una imagen para el logo.')
  if (file.data.byteLength > LOGO_MAX_BYTES) throw apiError(413, TOO_BIG)

  const bytes = new Uint8Array(file.data)
  const type = detectLogoType(bytes)
  if (!type) throw apiError(415, 'El logo tiene que ser una imagen PNG, JPEG, WebP o SVG.')

  const { result } = await mutateLive(async () => {
    await writeLogo(variant, bytes, type)
    const settings = await readSettings()
    const next: Settings = {
      ...settings,
      [LOGO_FLAG[variant]]: true,
      logoVersion: settings.logoVersion + 1,
    }
    await writeSettings(next)
    return next
  })
  return result
})
