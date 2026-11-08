// Serves the logo uploaded for the variant's background, else the one uploaded
// for the other background (a single upload covers both), else redirects to
// the default one for the variant. `v` (the settings' logoVersion) only busts
// caches.
export default defineEventHandler(async (event) => {
  const variant: LogoVariant = getQuery(event).variant === 'dark' ? 'dark' : 'light'
  const other: LogoVariant = variant === 'dark' ? 'light' : 'dark'
  const settings = await readSettings()
  const logo =
    (settings[LOGO_FLAG[variant]] ? await readLogo(variant) : null) ??
    (settings[LOGO_FLAG[other]] ? await readLogo(other) : null)

  if (!logo) {
    setResponseHeader(event, 'Cache-Control', 'no-cache')
    return sendRedirect(event, defaultLogoPath(variant), 302)
  }

  setResponseHeaders(event, {
    'Content-Type': logo.meta.type,
    'Content-Length': logo.bytes.byteLength,
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  })
  // Scripts or external resources in an uploaded SVG never run, even when
  // the logo is opened on its own.
  if (logo.meta.type === 'image/svg+xml')
    setResponseHeader(
      event,
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'"
    )
  return logo.bytes
})
