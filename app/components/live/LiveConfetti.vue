<script setup lang="ts">
// Light canvas confetti: it rains for `duration` ms and then lets the last
// pieces fall off the screen. Nothing is drawn for people who prefer reduced
// motion.

const props = withDefaults(
  defineProps<{
    colors: string[]
    amount?: number
    duration?: number
  }>(),
  { amount: 140, duration: 4500 }
)

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  spin: number
  tilt: number
  tiltSpeed: number
  round: boolean
}

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let frame = 0

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx || !props.colors.length) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let width = 0
  let height = 0
  let unit = 1
  function resize() {
    if (!el || !ctx) return
    width = el.clientWidth
    height = el.clientHeight
    unit = Math.max(width, height) / 1000
    el.width = Math.round(width * dpr)
    el.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  useEventListener(window, 'resize', resize)

  function spawn(initial: boolean): Piece {
    return {
      x: Math.random() * width,
      // The first wave starts spread above the top edge so it enters gradually.
      y: initial ? -20 - Math.random() * height * 0.7 : -20,
      vx: (Math.random() - 0.5) * 140 * unit,
      vy: (170 + Math.random() * 230) * unit,
      size: (7 + Math.random() * 9) * unit,
      color: props.colors[Math.floor(Math.random() * props.colors.length)]!,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 8,
      tilt: Math.random() * Math.PI * 2,
      tiltSpeed: 3 + Math.random() * 5,
      round: Math.random() < 0.25,
    }
  }

  const pieces = Array.from({ length: props.amount }, () => spawn(true))
  const start = performance.now()
  let last = start

  function tick(now: number) {
    if (!ctx) return
    // Clamp the step so a background tab does not teleport the pieces.
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const raining = now - start < props.duration
    ctx.clearRect(0, 0, width, height)

    let alive = 0
    for (const p of pieces) {
      if (p.y > height + 30) {
        if (!raining) continue
        Object.assign(p, spawn(false))
      }
      alive++
      p.tilt += p.tiltSpeed * dt
      p.rotation += p.spin * dt
      p.x += (p.vx + Math.sin(p.tilt) * 40 * unit) * dt
      p.y += p.vy * dt

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = p.color
      if (p.round) {
        ctx.beginPath()
        ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Scaling the height with the tilt makes the strips flip as they fall.
        const h = p.size * 0.5 * Math.abs(Math.cos(p.tilt)) + 1
        ctx.fillRect(-p.size / 2, -h / 2, p.size, h)
      }
      ctx.restore()
    }

    if (alive) frame = requestAnimationFrame(tick)
  }

  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <canvas ref="canvas" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
</template>
