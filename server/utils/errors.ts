/**
 * HTTP error whose Spanish text the UI shows as is.
 *
 * The text goes to both `statusMessage` and `message`, and it is set after
 * createError: h3 warns about non-ASCII status messages and strips them from
 * the HTTP status line, but keeps them intact in the JSON error body.
 */
export function apiError(statusCode: number, text: string, data?: Record<string, unknown>) {
  const error = createError({ statusCode, message: text, data })
  error.statusMessage = text
  return error
}
