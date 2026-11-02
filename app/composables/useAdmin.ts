import type {
  AnnounceBody,
  CardBatch,
  CardBatchSummary,
  CardCheckResult,
  DrawResult,
  GameRecord,
  GameSummary,
  LiveState,
  RegisterBatchBody,
  SessionInfo,
  SetBody,
  Settings,
  SettingsBody,
  StartGameBody,
  UpdateGameBody,
} from '#shared/types/api'
import type { BingoSet, BingoSetSummary, PublicDisplay } from '#shared/types/bingo'
import PanelConfirmModal from '~/components/panel/ConfirmModal.vue'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: Record<string, unknown> | FormData | object
  query?: Record<string, string | undefined>
  /** Do not toast the error (the page shows `error` inline instead). */
  quiet?: boolean
}

// Plain signature: the URLs are built at runtime, so Nitro's typed routes
// add nothing here and cannot resolve generic response types.
type AdminFetch = <T>(
  url: string,
  options: {
    method: Method
    body?: Record<string, unknown> | FormData
    query?: Record<string, string | undefined>
  }
) => Promise<T>

interface FetchFailure {
  statusCode?: number
  statusMessage?: string
  status?: number
  data?: { statusMessage?: string; message?: string }
  response?: { status?: number }
}

function failureStatus(error: unknown): number {
  const e = error as FetchFailure
  return e?.statusCode ?? e?.status ?? e?.response?.status ?? 0
}

// The body keeps the Spanish text intact; h3 strips non-ASCII characters
// from the HTTP status line, so statusMessage on the error itself is mangled.
function failureMessage(error: unknown): string {
  const e = error as FetchFailure
  const status = failureStatus(error)
  const text = e?.data?.statusMessage || e?.data?.message
  if (text) return text
  if (!status) return 'No se ha podido conectar con el servidor. Comprueba la conexión.'
  if (status === 429) return 'Demasiadas peticiones. Espera un momento y vuelve a intentarlo.'
  if (status >= 500) return 'Error en el servidor. Vuelve a intentarlo en unos segundos.'
  return e?.statusMessage || `Error ${status}`
}

/**
 * Typed client for the admin API. Errors are shown as toasts (with the
 * server's Spanish message), a 401 sends the user to the login page, and
 * every LiveState returned by a game action is applied right away.
 *
 * Call it from setup only: it captures the Nuxt context once.
 */
export function useAdmin() {
  const nuxtApp = useNuxtApp()
  const toast = useToast()
  const route = useRoute()
  // Forwards the session cookie during SSR; plain $fetch in the browser.
  const fetcher = useRequestFetch() as unknown as AdminFetch
  const live = useLiveState()

  /** Mutations in flight (reads do not count). */
  const inFlight = ref(0)
  const pending = computed(() => inFlight.value > 0)
  /** Message of the last failed request, or null. */
  const error = ref<string | null>(null)

  type Outcome<T> = { ok: true; data: T } | { ok: false }

  async function call<T>(url: string, options: RequestOptions = {}): Promise<Outcome<T>> {
    const method = options.method ?? 'GET'
    const mutation = method !== 'GET'
    if (mutation) inFlight.value++
    error.value = null
    try {
      const data = await fetcher<T>(url, {
        method,
        body: options.body as Record<string, unknown> | FormData | undefined,
        query: options.query,
      })
      return { ok: true, data }
    } catch (failure) {
      const status = failureStatus(failure)
      error.value = failureMessage(failure)
      if (status === 401) {
        if (import.meta.client)
          toast.add({
            title: 'La sesión ha caducado',
            description: 'Vuelve a introducir la clave de administración.',
            color: 'warning',
            icon: 'i-lucide-lock',
          })
        await nuxtApp.runWithContext(() =>
          navigateTo({ path: '/panel/acceso', query: { redirect: route.fullPath } })
        )
      } else if (!options.quiet && import.meta.client) {
        toast.add({
          title: mutation
            ? 'No se ha podido completar la acción'
            : 'No se han podido cargar los datos',
          description: error.value,
          color: 'error',
          icon: 'i-lucide-circle-alert',
        })
      }
      return { ok: false }
    } finally {
      if (mutation) inFlight.value--
    }
  }

  /** Data of a successful request, or null after a failure (already reported). */
  async function request<T>(url: string, options: RequestOptions = {}): Promise<T | null> {
    const outcome = await call<T>(url, options)
    return outcome.ok ? outcome.data : null
  }

  /** Runs a request that answers 204; true when it worked. */
  async function send(url: string, options: RequestOptions): Promise<boolean> {
    return (await call<unknown>(url, options)).ok
  }

  async function liveAction(url: string, options: RequestOptions): Promise<LiveState | null> {
    const state = await request<LiveState>(url, options)
    if (state) live.apply(state)
    return state
  }

  // Settings routes answer with Settings only; patch them into the live
  // state so the logo and title change at once (the stream confirms later).
  function patchSettings(settings: Settings | null) {
    if (settings && live.state.value)
      live.state.value = { ...live.state.value, settings: { ...settings } }
    return settings
  }

  return {
    pending,
    error,

    // Auth
    session: () => request<SessionInfo>('/api/auth/session'),
    logout: () => send('/api/auth/logout', { method: 'POST' }),

    // Live game
    startGame: (body: StartGameBody) => liveAction('/api/game/start', { method: 'POST', body }),
    updateGame: (body: UpdateGameBody) => liveAction('/api/game', { method: 'PATCH', body }),
    async draw(index?: number) {
      const result = await request<DrawResult>('/api/game/draw', {
        method: 'POST',
        body: index === undefined ? {} : { index },
      })
      if (result) live.apply(result.state)
      return result
    },
    undo: () => liveAction('/api/game/undo', { method: 'POST' }),
    announce: (body: AnnounceBody) => liveAction('/api/game/announce', { method: 'POST', body }),
    hideAnnouncement: () => liveAction('/api/game/announce', { method: 'DELETE' }),
    finishGame: () => liveAction('/api/game/finish', { method: 'POST' }),

    // History
    history: () => request<GameSummary[]>('/api/history'),
    game: (id: string) => request<GameRecord>(`/api/history/${encodeURIComponent(id)}`),
    deleteGame: (id: string) =>
      send(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // Sets
    sets: () => request<BingoSetSummary[]>('/api/sets'),
    set: (id: string) => request<BingoSet>(`/api/sets/${encodeURIComponent(id)}`),
    createSet: (body: SetBody) => request<BingoSet>('/api/sets', { method: 'POST', body }),
    updateSet: (id: string, body: SetBody) =>
      request<BingoSet>(`/api/sets/${encodeURIComponent(id)}`, { method: 'PUT', body }),
    deleteSet: (id: string) => send(`/api/sets/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // Settings and branding
    settings: () => request<Settings>('/api/settings'),
    async updateSettings(body: Partial<SettingsBody>) {
      return patchSettings(await request<Settings>('/api/settings', { method: 'PUT', body }))
    },
    async uploadLogo(file: File) {
      const form = new FormData()
      form.append('file', file)
      return patchSettings(
        await request<Settings>('/api/branding/logo', { method: 'POST', body: form })
      )
    },
    async resetLogo() {
      return patchSettings(await request<Settings>('/api/branding/logo', { method: 'DELETE' }))
    },

    // Card batches and checking
    registerBatch: (body: RegisterBatchBody) =>
      request<CardBatchSummary>('/api/batches', { method: 'POST', body }),
    importBatch: (batch: CardBatch) =>
      request<CardBatchSummary>('/api/batches/import', { method: 'POST', body: batch }),
    batches: () => request<CardBatchSummary[]>('/api/batches'),
    deleteBatch: (id: string) =>
      send(`/api/batches/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    check: (code: string, gameId?: string, options: { quiet?: boolean } = {}) =>
      request<CardCheckResult>('/api/check', { query: { code, gameId }, ...options }),
  }
}

// ─── Confirmation dialogs ──────────────────────────────────────────────────

export interface PanelConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  color?: 'primary' | 'error' | 'warning' | 'success' | 'neutral'
  icon?: string
}

/** Returns a function that opens a confirmation modal and resolves to true on confirm. */
export function usePanelConfirm() {
  const overlay = useOverlay()
  return async (options: PanelConfirmOptions): Promise<boolean> => {
    // A fresh overlay per question, removed from the provider once closed.
    const modal = overlay.create(PanelConfirmModal, { destroyOnClose: true })
    return (await modal.open(options).result) === true
  }
}

// ─── Formatting (Spanish locale) ───────────────────────────────────────────

export const PANEL_DISPLAY_OPTIONS: { label: string; value: PublicDisplay; description: string }[] =
  [
    { label: 'Símbolo', value: 'label', description: 'Solo la etiqueta (42, H, ∫…)' },
    { label: 'Nombre', value: 'name', description: 'Solo el nombre largo' },
    { label: 'Ambos', value: 'both', description: 'Etiqueta y nombre' },
  ]

export function panelDisplayLabel(display: PublicDisplay): string {
  return PANEL_DISPLAY_OPTIONS.find((o) => o.value === display)?.label ?? display
}

const dateTimeFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
const timeFormat = new Intl.DateTimeFormat('es-ES', { timeStyle: 'medium' })
const longDateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' })

export function formatPanelDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—'
}

export function formatPanelTime(iso: string | null | undefined): string {
  return iso ? timeFormat.format(new Date(iso)) : '—'
}

export function formatPanelLongDate(date: Date = new Date()): string {
  return longDateFormat.format(date)
}

/** "1 h 05 min", "12 min 30 s" or "45 s". */
export function formatPanelDuration(fromIso: string, toIso: string | null): string {
  if (!toIso) return '—'
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m) return `${m} min ${String(s).padStart(2, '0')} s`
  return `${s} s`
}

// ─── Downloads ─────────────────────────────────────────────────────────────

/** Saves a text or binary blob with the given file name. */
export function downloadPanelFile(fileName: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Excel evaluates a text cell starting with one of these as a formula, even
// when quoted; symbol sets have labels such as "+", "-" and "=".
const CSV_FORMULA_START = /^[=+\-@\t\r]/

/**
 * CSV that Excel opens correctly in Spanish: UTF-8 BOM, `;` separator
 * (Excel's list separator for es-ES), CRLF and every field quoted. Text that
 * Excel would run as a formula gets a leading apostrophe.
 */
export function buildPanelCsv(rows: (string | number | null | undefined)[][]): string {
  const quote = (value: string | number | null | undefined) => {
    const text = String(value ?? '')
    const safe = typeof value === 'string' && CSV_FORMULA_START.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  return '\uFEFF' + rows.map((row) => row.map(quote).join(';')).join('\r\n') + '\r\n'
}

/** File-name friendly slug ("Partida del 2 de noviembre" → "partida-del-2-de-noviembre"). */
export function panelSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'bingo'
  )
}
