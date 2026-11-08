<script setup lang="ts">
// Canvas fireworks for the bingo: rockets rise from the bottom edge and burst
// into sparks for `duration` ms, then the last sparks fade out. Nothing is
// drawn for people who prefer reduced motion. Kept light for the old browsers
// of smart TVs: plain 2D canvas, no filters or shadows.

const props = withDefaults(
  defineProps<{
    colors: string[]
    duration?: number
    /** Additive blending, which glows on dark backgrounds and washes out on light ones. */
    glow?: boolean
  }>(),
  { duration: 7000, glow: true }
)

interface Rocket {
  x: number
  y: number
  vx: number
  vy: number
  color: string
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  /** 1 when born, the spark disappears at 0. */
  life: number
  /** Life lost per second. */
  fade: number
  color: string
  /** Sparks of the gold "willow" bursts fall slower and leave longer streaks. */
  heavy: boolean
  twinkle: boolean
  /** The bright disc at the centre of a burst, which does not move. */
  flash?: boolean
}

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let frame = 0

/** Gold of the willow bursts: pale to glow on dark, deeper to show on light. */
const WILLOW = { glow: '#fde68a', flat: '#d97706' }

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx || !props.colors.length) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let width = 0
  let height = 0
  /** Pixels per thousandth of the larger side, so every screen sees the same show. */
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

  const pick = () => props.colors[Math.floor(Math.random() * props.colors.length)]!
  const gravity = () => 260 * unit

  const rockets: Rocket[] = []
  const sparks: Spark[] = []

  function launch() {
    // Fast enough to peak between 15 % and 45 % of the height.
    const peak = height * (0.15 + Math.random() * 0.3)
    const vy = -Math.sqrt(2 * gravity() * (height - peak))
    rockets.push({
      x: width * (0.12 + Math.random() * 0.76),
      y: height + 10,
      vx: (Math.random() - 0.5) * 60 * unit,
      vy,
      color: pick(),
    })
  }

  function explode(r: Rocket) {
    const kind = Math.random()
    const willow = kind < 0.2
    const ring = !willow && kind < 0.45
    const count = Math.round((willow ? 70 : 90) + Math.random() * 40)
    const speed = (willow ? 220 : 330 + Math.random() * 150) * unit
    // Half the bursts mix in a second colour.
    const second = Math.random() < 0.5 ? pick() : r.color
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.08
      const v = ring ? speed * (0.95 + Math.random() * 0.1) : speed * Math.sqrt(Math.random())
      sparks.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(angle) * v + r.vx * 0.3,
        vy: Math.sin(angle) * v + r.vy * 0.1,
        life: 1,
        fade: willow ? 0.45 + Math.random() * 0.2 : 0.75 + Math.random() * 0.5,
        color: willow ? (props.glow ? WILLOW.glow : WILLOW.flat) : i % 2 ? second : r.color,
        heavy: willow,
        twinkle: Math.random() < 0.3,
      })
    }
    // A bright flash at the centre of the burst.
    sparks.push({
      x: r.x,
      y: r.y,
      vx: 0,
      vy: 0,
      life: 1,
      fade: 4,
      color: '#ffffff',
      heavy: false,
      twinkle: false,
      flash: true,
    })
  }

  const start = performance.now()
  let last = start
  let nextLaunch = start

  function tick(now: number) {
    if (!ctx) return
    // Clamp the step so a background tab does not teleport the sparks.
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const showing = now - start < props.duration

    if (showing && now >= nextLaunch) {
      // Now and then a salvo of two or three rockets.
      const salvo = Math.random() < 0.3 ? 2 + Math.round(Math.random()) : 1
      for (let i = 0; i < salvo; i++) launch()
      nextLaunch = now + 280 + Math.random() * 420
    }

    ctx.clearRect(0, 0, width, height)
    ctx.globalCompositeOperation = props.glow ? 'lighter' : 'source-over'
    ctx.lineCap = 'round'

    const g = gravity()
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]!
      r.vy += g * dt
      r.x += r.vx * dt
      r.y += r.vy * dt
      // Bursts at the top of its climb.
      if (r.vy >= -20 * unit) {
        explode(r)
        rockets.splice(i, 1)
        continue
      }
      ctx.strokeStyle = r.color
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 3 * unit
      ctx.beginPath()
      ctx.moveTo(r.x, r.y)
      ctx.lineTo(r.x - r.vx * 0.04, r.y - r.vy * 0.04)
      ctx.stroke()
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!
      s.life -= s.fade * dt
      if (s.life <= 0) {
        sparks.splice(i, 1)
        continue
      }
      if (s.flash) {
        ctx.globalAlpha = s.life
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x, s.y, 26 * unit * s.life, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      // Air drag, frame-rate independent.
      const drag = Math.pow(s.heavy ? 0.25 : 0.4, dt)
      s.vx *= drag
      s.vy = s.vy * drag + g * (s.heavy ? 0.35 : 0.5) * dt
      s.x += s.vx * dt
      s.y += s.vy * dt

      let alpha = Math.min(1, s.life * 1.4)
      if (s.twinkle && s.life < 0.5 && Math.random() < 0.4) alpha *= 0.2
      ctx.globalAlpha = alpha
      ctx.strokeStyle = s.color
      ctx.lineWidth = (s.heavy ? 2.2 : 2.8) * unit
      const streak = s.heavy ? 0.09 : 0.045
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.x - s.vx * streak, s.y - s.vy * streak)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    if (showing || rockets.length || sparks.length) frame = requestAnimationFrame(tick)
    else ctx.clearRect(0, 0, width, height)
  }

  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <canvas ref="canvas" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
</template>
