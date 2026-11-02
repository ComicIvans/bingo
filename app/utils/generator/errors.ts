// Reading errors thrown by $fetch: the server sends Spanish messages in
// `statusMessage`, which the UI shows as is.

interface FetchFailure {
  statusCode?: number
  status?: number
  statusMessage?: string
  data?: { statusMessage?: string; message?: string }
  response?: { status?: number }
}

export function apiStatus(error: unknown): number {
  const e = error as FetchFailure | null
  return e?.statusCode ?? e?.status ?? e?.response?.status ?? 0
}

export function apiMessage(error: unknown, fallback: string): string {
  const e = error as FetchFailure | null
  // The JSON body keeps the Spanish text intact; the status line may not.
  const message = e?.data?.statusMessage || e?.data?.message || e?.statusMessage
  // Generic HTTP reason phrases are not worth showing.
  return message && !/^(Internal Server Error|Not Found|Bad Request|Unauthorized)$/i.test(message)
    ? message
    : fallback
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
