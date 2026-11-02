// Exchanges the admin key for the panel session cookie. The key only travels
// in the request body, never in the URL.
export default defineEventHandler(async (event) => {
  if (!isPanelConfigured()) throw apiError(503, NOT_CONFIGURED_MESSAGE)
  if ('key' in getQuery(event))
    throw apiError(400, 'La clave no se puede enviar en la dirección. Usa el formulario de acceso.')

  const address = clientAddress(event)
  assertLoginAllowed(event, address)
  // The only public form: never read a large body.
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > 8 * 1024)
    throw apiError(413, 'La petición es demasiado grande.')

  const { key } = await readBodyWith(event, loginSchema)
  if (!keyMatches(key)) {
    recordLoginFailure(address)
    throw apiError(401, 'La clave de administración no es correcta.')
  }

  clearLoginFailures(address)
  await startAdminSession(event)
  return sendNoContent(event, 204)
})
