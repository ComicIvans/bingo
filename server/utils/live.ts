import type { H3Event } from 'h3'
import type { LiveState } from '#shared/types/api'

// Live state for the public screen, the board and the panel: built from the
// stored settings, current game and announcement, cached in memory and
// pushed in full to every open SSE stream after each change (every admin
// mutation goes through mutateLive, even those that leave the state as is).

type LiveStream = ReturnType<typeof createEventStream>

interface LiveClient {
  stream: LiveStream
  event: H3Event
}

const PING_INTERVAL_MS = 20_000
// A client that stops reading is dropped once this much is waiting for it
// (the browser reconnects and gets the full state again).
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024

const clients = new Set<LiveClient>()
let pingTimer: ReturnType<typeof setInterval> | null = null
let cachedState: LiveState | null = null
let lastVersion: number | null = null

async function currentVersion(): Promise<number> {
  if (lastVersion === null) {
    const stored = await readStoredVersion()
    if (stored === null) {
      lastVersion = Date.now()
      await writeStoredVersion(lastVersion)
    } else lastVersion = stored
  }
  return lastVersion
}

async function buildLiveState(version: number): Promise<LiveState> {
  const [settings, game, announcement] = await Promise.all([
    readSettings(),
    readCurrentGame(),
    readAnnouncement(),
  ])
  return { version, settings, game: game ? toLiveGame(game) : null, announcement }
}

/** Current live state (built once, then kept up to date by publishLiveState). */
export async function getLiveState(): Promise<LiveState> {
  // Built under the lock so a mutation in progress cannot be overwritten by
  // a state read before it.
  return (
    cachedState ??
    withLock(async () => (cachedState ??= await buildLiveState(await currentVersion())))
  )
}

/**
 * Bumps the version, rebuilds the state and sends it to every stream.
 * Call it inside withLock, after the change is stored.
 */
export async function publishLiveState(): Promise<LiveState> {
  // Time-based, so versions keep growing across restarts and clients never
  // take a fresh state for an old one.
  const version = Math.max((await currentVersion()) + 1, Date.now())
  await writeStoredVersion(version)
  lastVersion = version
  cachedState = await buildLiveState(version)
  broadcast(cachedState)
  return cachedState
}

function isClientError(error: unknown): boolean {
  return isError(error) && error.statusCode >= 400 && error.statusCode < 500
}

/** Runs a change under the lock, then publishes the new live state. */
export function mutateLive<T>(change: () => Promise<T>): Promise<{ result: T; state: LiveState }> {
  return withLock(async () => {
    let result: T
    try {
      result = await change()
    } catch (error) {
      // Changes throw their 4xx errors before writing anything. Any other
      // failure may have stored part of the change: resync the screens with
      // storage, or at least rebuild the state on the next read.
      if (!isClientError(error))
        await publishLiveState().catch(() => {
          cachedState = null
        })
      throw error
    }
    const state = await publishLiveState()
    return { result, state }
  })
}

// ─── Server-Sent Events ────────────────────────────────────────────────────

function dropClient(client: LiveClient) {
  if (!clients.delete(client)) return
  void client.stream.close().catch(() => undefined)
  if (!clients.size && pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function sendTo(client: LiveClient, message: { event: string; data: string }) {
  if (client.event.node.res.writableLength > MAX_BUFFERED_BYTES) return dropClient(client)
  // Never awaited: a slow client must not hold up the others or the lock.
  client.stream.push(message).catch(() => dropClient(client))
}

function broadcast(state: LiveState) {
  if (!clients.size) return
  const data = JSON.stringify(state)
  for (const client of clients) sendTo(client, { event: 'state', data })
}

function ensurePing() {
  if (pingTimer) return
  pingTimer = setInterval(() => {
    const data = String(Date.now())
    for (const client of clients) sendTo(client, { event: 'ping', data })
  }, PING_INTERVAL_MS)
  pingTimer.unref?.()
}

/** Opens an SSE stream that gets the full state now and after every change. */
export function openLiveStream(event: H3Event) {
  const stream = createEventStream(event)
  const client: LiveClient = { stream, event }
  clients.add(client)
  ensurePing()

  stream.onClosed(() => dropClient(client))
  // The response closes when the browser goes away or the stream ends.
  event.node.res.on('close', () => dropClient(client))

  // Queued, not awaited: the stream only drains once send() has started.
  void getLiveState()
    .then((state) => {
      if (clients.has(client)) sendTo(client, { event: 'state', data: JSON.stringify(state) })
    })
    .catch(() => dropClient(client))

  const sending = stream.send()
  // send() has just set h3's defaults; these are the ones proxies care about
  // (no buffering, no compression). Headers go out with the first write.
  setResponseHeaders(event, {
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  return sending
}
