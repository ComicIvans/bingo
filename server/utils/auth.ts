import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

// Panel authentication: one admin key (NUXT_ADMIN_KEY) exchanged for a sealed
// session cookie. The key itself is never stored in the cookie.

const SESSION_NAME = 'bingo-admin'
const SESSION_MAX_AGE = 14 * 24 * 60 * 60

const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX_FAILURES = 10
// Across every address. On a private network with no proxy in front (a
// venue's Wi-Fi) X-Forwarded-For can be forged on each attempt, so the
// per-address limit alone would not stop guessing. It also keeps the
// failures map small.
const RATE_MAX_FAILURES_GLOBAL = 50

export const NOT_CONFIGURED_MESSAGE = 'El panel no está configurado: define NUXT_ADMIN_KEY.'

interface AdminSessionData {
  admin?: boolean
  /** Fingerprint of the key used to log in: changing the key logs everyone out. */
  keyId?: string
  loginAt?: number
}

let warnedDerivedPassword = false

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest()
}

// Runtime config values come from env vars parsed with destr, so a numeric
// key arrives as a number.
function adminKey(): string {
  return String(useRuntimeConfig().adminKey ?? '').trim()
}

export function isPanelConfigured(): boolean {
  return adminKey().length > 0
}

function adminKeyId(): string {
  return sha256(`bingo-admin-key:${adminKey()}`).toString('hex').slice(0, 16)
}

function sessionPassword(): string {
  const configured = String(useRuntimeConfig().sessionPassword ?? '')
  if (configured.length >= 32) return configured
  if (!warnedDerivedPassword) {
    warnedDerivedPassword = true
    console.warn(
      '[bingo] NUXT_SESSION_PASSWORD falta o tiene menos de 32 caracteres: el secreto de la cookie del panel se deriva de NUXT_ADMIN_KEY.'
    )
  }
  return sha256(`bingo-session-password:${adminKey()}`).toString('hex')
}

function sessionConfig(event: H3Event) {
  return {
    name: SESSION_NAME,
    password: sessionPassword(),
    maxAge: SESSION_MAX_AGE,
    // Cookie only: no session header, so nothing but the browser carries it.
    sessionHeader: false as const,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: getRequestProtocol(event, { xForwardedProto: true }) === 'https',
    },
  }
}

/** Whether the request carries a valid panel session. */
export async function isAdmin(event: H3Event): Promise<boolean> {
  // An empty key would make the derived password predictable.
  if (!isPanelConfigured()) return false
  const sealed = getCookie(event, SESSION_NAME)
  if (!sealed) return false
  try {
    // Unsealed directly: useSession would hand out a new cookie to anyone
    // without a valid one.
    const session = await unsealSession(event, sessionConfig(event), sealed)
    const data = (session.data ?? {}) as AdminSessionData
    return data.admin === true && data.keyId === adminKeyId()
  } catch {
    return false
  }
}

/** Throws a 401 unless the request carries a valid panel session. */
export async function requireAdmin(event: H3Event) {
  if (!(await isAdmin(event)))
    throw apiError(
      401,
      'Tu sesión del panel ha caducado o no has entrado. Vuelve a introducir la clave.'
    )
}

/** Constant-time comparison of a typed key with NUXT_ADMIN_KEY. */
export function keyMatches(candidate: string): boolean {
  return timingSafeEqual(sha256(candidate.trim()), sha256(adminKey()))
}

export async function startAdminSession(event: H3Event) {
  const config = sessionConfig(event)
  // A fresh session, so the 14 days count from this login and no earlier
  // cookie is reused.
  event.context.sessions = {
    ...event.context.sessions,
    [SESSION_NAME]: { id: randomUUID(), createdAt: Date.now(), data: {} },
  }
  const session = await useSession<AdminSessionData>(event, config)
  await session.update({ admin: true, keyId: adminKeyId(), loginAt: Date.now() })
}

export function endAdminSession(event: H3Event) {
  const { cookie } = sessionConfig(event)
  deleteCookie(event, SESSION_NAME, cookie)
}

// ─── Login rate limit ──────────────────────────────────────────────────────

const failures = new Map<string, number[]>()
let allFailures: number[] = []

function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^::ffff:/i, '')
  return (
    ip === '::1' ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip)
  )
}

/**
 * Address to rate-limit by. X-Forwarded-For is only trusted when the request
 * comes from a loopback or private peer (a local proxy), and then only its
 * last hop (the one that proxy added): the first entries are whatever the
 * client sent. A private peer with no proxy in front can still forge it,
 * which the global cap covers.
 */
export function clientAddress(event: H3Event): string {
  const peer = event.node.req.socket?.remoteAddress ?? ''
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  if (forwarded && isPrivateAddress(peer)) {
    const lastHop = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean)
      .at(-1)
    if (lastHop) return lastHop
  }
  return peer || 'desconocida'
}

function forgetOldFailures(now: number) {
  const fresh = (times: number[]) => times.filter((time) => now - time < RATE_WINDOW_MS)
  for (const [key, times] of failures) {
    const kept = fresh(times)
    if (kept.length) failures.set(key, kept)
    else failures.delete(key)
  }
  allFailures = fresh(allFailures)
}

/** When the window lets one more attempt in, or null when it already does. */
function blockedUntil(times: number[], max: number): number | null {
  if (times.length < max) return null
  // Attempts are allowed again once enough of the oldest ones expire.
  return times[times.length - max]! + RATE_WINDOW_MS
}

/**
 * Throws a 429 when the address failed too many logins recently, or when
 * every address together did (a correct key is refused too until then).
 */
export function assertLoginAllowed(event: H3Event, address: string) {
  const now = Date.now()
  forgetOldFailures(now)
  const until =
    blockedUntil(failures.get(address) ?? [], RATE_MAX_FAILURES) ??
    blockedUntil(allFailures, RATE_MAX_FAILURES_GLOBAL)
  if (until === null) return
  const retryAfter = Math.max(1, Math.ceil((until - now) / 1000))
  setResponseHeader(event, 'Retry-After', retryAfter)
  const minutes = Math.ceil(retryAfter / 60)
  throw apiError(
    429,
    `Demasiados intentos fallidos. Espera ${minutes === 1 ? 'un minuto' : `${minutes} minutos`} y vuelve a probar.`
  )
}

export function recordLoginFailure(address: string) {
  const now = Date.now()
  const list = failures.get(address) ?? []
  list.push(now)
  failures.set(address, list)
  allFailures.push(now)
}

export function clearLoginFailures(address: string) {
  failures.delete(address)
}
