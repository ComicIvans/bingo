// Server-Sent Events: `state` with the full LiveState on connect and after
// every change, `ping` every 20 s.
export default defineEventHandler((event) => openLiveStream(event))
