import type { LiveState } from '#shared/types/api'

// One EventSource per tab, shared by every component that reads the live
// state. The server sends the whole state on connect and after each change,
// so a reconnect needs no catch-up logic.

let source: EventSource | null = null
let users = 0

function connect(state: Ref<LiveState | null>, connected: Ref<boolean>) {
  if (source) return
  source = new EventSource('/api/live/stream')
  source.addEventListener('open', () => (connected.value = true))
  source.addEventListener('error', () => (connected.value = false))
  source.addEventListener('state', (event) => {
    const next = JSON.parse((event as MessageEvent<string>).data) as LiveState
    // Versions are time-based on the server, so they keep growing across
    // restarts; anything older than what we show is stale.
    if (!state.value || next.version >= state.value.version) state.value = next
    connected.value = true
  })
}

function disconnect(connected: Ref<boolean>) {
  source?.close()
  source = null
  connected.value = false
}

/**
 * Live state of the bingo (settings, current game, announcement), fetched on
 * the server for the first render and kept up to date in the browser.
 */
export function useLiveState() {
  const state = useState<LiveState | null>('live-state', () => null)
  const connected = useState('live-connected', () => false)

  // Applies a state returned by an admin action right away, without waiting
  // for the stream to echo it.
  function apply(next: LiveState) {
    if (!state.value || next.version >= state.value.version) state.value = next
  }

  if (import.meta.client) {
    onMounted(() => {
      users++
      connect(state, connected)
    })
    onBeforeUnmount(() => {
      users--
      if (users <= 0) {
        users = 0
        disconnect(connected)
      }
    })
  }

  const ready = useAsyncData('live-state', async () => {
    const initial = await $fetch<LiveState>('/api/live')
    apply(initial)
    return initial
  })

  return { state, connected, apply, ready }
}
