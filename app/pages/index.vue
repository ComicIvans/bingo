<script setup lang="ts">
import { DEFAULT_SETTINGS } from '#shared/types/api'
import type { Announcement } from '#shared/types/api'

// Public screen for a projector or a TV. It keeps its own theme (the
// publicTheme setting) whatever colour mode the rest of the site uses.

const { state, connected, ready } = useLiveState()
await ready

/** Accent while there is no game (the app's primary rose). */
const DEFAULT_ACCENT = '#f43f5e'

const settings = computed(() => state.value?.settings ?? DEFAULT_SETTINGS)
const game = computed(() => state.value?.game ?? null)
const theme = computed(() => (settings.value.publicTheme === 'light' ? 'light' : 'dark'))
const phase = computed(() => {
  if (!game.value) return 'waiting'
  return game.value.status === 'finished' ? 'finished' : 'running'
})

// A colour CSS cannot parse would void every gradient that uses it.
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]+\)|[a-z]+)$/i
const accent = computed(() => {
  const color = game.value?.color?.trim() ?? ''
  return SAFE_COLOR.test(color) ? color : DEFAULT_ACCENT
})
const display = computed(() => game.value?.publicDisplay ?? 'label')
const draws = computed(() => game.value?.draws ?? [])
const total = computed(() => game.value?.total ?? 0)
const current = computed(() => draws.value.at(-1) ?? null)
const progress = computed(() =>
  total.value ? Math.min(100, (draws.value.length / total.value) * 100) : 0
)

/** Previous draws, most recent first, without the one on the big ball. */
const recent = computed(() => {
  const count = Math.max(0, Math.floor(settings.value.recentCount))
  const list = draws.value
  if (!count || list.length < 2) return []
  return list.slice(Math.max(0, list.length - 1 - count), -1).reverse()
})

// Screen readers hear the same field the ball shows: never the label in
// 'name' games, where finding it is the point of the game.
const spokenDraw = computed(() => {
  const item = current.value
  if (!item || phase.value !== 'running') return ''
  if (display.value === 'label') return `Ha salido: ${item.label}`
  if (display.value === 'name') return `Ha salido: ${item.name}`
  return `Ha salido: ${item.label}, ${item.name}`
})

// ─── Logo ──────────────────────────────────────────────────────────────────

const logoUrl = computed(
  () => `/api/branding/logo?variant=${theme.value}&v=${settings.value.logoVersion}`
)
const logoFailed = ref(false)
watch(logoUrl, () => (logoFailed.value = false))
const logoAlt = computed(() => (settings.value.title.trim() ? '' : 'Logo del bingo'))

// ─── Draw animation ────────────────────────────────────────────────────────

const ballWrap = useTemplateRef<HTMLElement>('ballWrap')
const burst = useTemplateRef<HTMLElement>('burst')
const { width: ballSize } = useElementSize(ballWrap)
const recentMax = computed(() => (ballSize.value ? ballSize.value * 0.45 : Infinity))

function animateDraw() {
  const ball = ballWrap.value
  if (!ball || typeof ball.animate !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ball.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' })
    return
  }
  ball.animate(
    [
      { transform: 'translateX(-60vw) rotate(-540deg) scale(0.45)', opacity: 0 },
      { transform: 'translateX(3%) rotate(10deg) scale(1.06)', opacity: 1, offset: 0.72 },
      { transform: 'translateX(0) rotate(0) scale(1)', opacity: 1 },
    ],
    { duration: 1100, easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)' }
  )
  burst.value?.animate(
    [
      { transform: 'scale(0.9)', opacity: 0 },
      { transform: 'scale(1)', opacity: 0.55, offset: 0.55 },
      { transform: 'scale(1.6)', opacity: 0 },
    ],
    { duration: 1500, easing: 'ease-out' }
  )
}

// Only a real new draw animates: not the first render, an undo, a new game
// or a reconnect that sends the same state again.
watch(
  () => ({ id: game.value?.id, count: draws.value.length, last: current.value?.index }),
  (next, prev) => {
    if (next.id !== prev.id || next.count <= prev.count || next.last === prev.last) return
    animateDraw()
  },
  { flush: 'post' }
)

// ─── Announcements ─────────────────────────────────────────────────────────

// The overlay follows the server: it stays until the panel hides it, makes
// another announcement or draws the next item (which clears it), so the
// panel's "En pantalla" is always true. Clicking or Escape hides it locally.
const overlay = ref<Announcement | null>(null)
let shownId: string | null = null

function showAnnouncement(announcement: Announcement) {
  shownId = announcement.id
  overlay.value = announcement
}

function dismissAnnouncement() {
  overlay.value = null
}

onMounted(() => {
  const initial = state.value?.announcement
  if (initial) showAnnouncement(initial)

  watch(
    () => state.value?.announcement ?? null,
    (announcement) => {
      if (!announcement) dismissAnnouncement()
      else if (announcement.id !== shownId) showAnnouncement(announcement)
    }
  )
})

// ─── Screen controls ───────────────────────────────────────────────────────

const fullscreen = useFullscreen()
const { isFullscreen, toggle: toggleFullscreen } = fullscreen
// VueUse reports support on the client right away; waiting for the mount keeps
// the first client render equal to the server one.
const mounted = useMounted()
const canFullscreen = computed(() => mounted.value && fullscreen.isSupported.value)
const { idle } = useIdle(3000)

defineShortcuts({
  f: () => {
    if (canFullscreen.value) toggleFullscreen()
  },
})

// Keep a laptop driving the projector from dimming or sleeping.
const wakeLock = useWakeLock()
onMounted(() => {
  if (wakeLock.isSupported.value) wakeLock.request('screen').catch(() => {})
})

// ─── Head ──────────────────────────────────────────────────────────────────

function withEventTitle(base: string, title: string) {
  const event = title.trim()
  return event && event.toLowerCase() !== 'bingo' ? `${base} · ${event}` : base
}

useSeoMeta({ title: () => withEventTitle('Bingo en directo', settings.value.title) })
useHead({ bodyAttrs: { class: 'overflow-hidden' } })
</script>

<template>
  <div
    class="screen"
    :class="{ 'screen--idle': idle }"
    :data-theme="theme"
    :style="{ '--c': accent }"
  >
    <!-- Running game -->
    <template v-if="phase === 'running' && game">
      <header class="screen__header">
        <img
          v-if="!logoFailed"
          :src="logoUrl"
          :alt="logoAlt"
          class="screen__logo"
          @error="logoFailed = true"
        />
        <div class="screen__titles">
          <h1 v-if="settings.title.trim()" class="screen__title">{{ settings.title }}</h1>
          <h1 v-else class="sr-only">Bingo en directo</h1>
          <p v-if="settings.subtitle.trim()" class="screen__subtitle">{{ settings.subtitle }}</p>
        </div>
      </header>

      <main class="stage">
        <div class="stage__grid">
          <section class="stage__counter" aria-label="Progreso de la partida">
            <p class="counter__game">{{ game.name }}</p>
            <p class="counter__text">
              <span class="counter__pre">Han salido</span>
              <span class="counter__n">{{ draws.length }}</span>
              <span class="counter__of">de {{ total }}</span>
            </p>
            <div
              class="counter__bar"
              role="progressbar"
              aria-label="Bolas sacadas"
              aria-valuemin="0"
              :aria-valuemax="total"
              :aria-valuenow="draws.length"
            >
              <div class="counter__fill" :style="{ width: `${progress}%` }" />
            </div>
          </section>

          <div class="stage__ball">
            <div ref="burst" class="stage__burst" aria-hidden="true" />
            <div
              ref="ballWrap"
              class="stage__ball-wrap"
              :class="{ 'stage__ball-wrap--idle': !current }"
            >
              <LiveBall :item="current" :color="accent" :display="display" :min-font="14" />
            </div>
          </div>

          <section class="stage__recent" aria-label="Bolas anteriores">
            <template v-if="recent.length">
              <p class="recent__heading" aria-hidden="true">Anteriores</p>
              <div class="recent__box">
                <LiveRecentDraws
                  :draws="recent"
                  :color="accent"
                  :display="display"
                  :max-size="recentMax"
                />
              </div>
            </template>
            <p v-else-if="!current" class="recent__hint">La primera bola está a punto de salir</p>
          </section>
        </div>
        <p class="sr-only" aria-live="polite">{{ spokenDraw }}</p>
      </main>
    </template>

    <!-- Finished game -->
    <main v-else-if="phase === 'finished' && game" class="hero">
      <img
        v-if="!logoFailed"
        :src="logoUrl"
        :alt="logoAlt"
        class="hero__logo hero__logo--small"
        @error="logoFailed = true"
      />
      <p v-if="settings.title.trim()" class="hero__event">{{ settings.title }}</p>
      <h1 class="hero__title">Partida finalizada</h1>
      <p class="hero__game">{{ game.name }}</p>
      <p class="hero__summary">
        Han salido <strong>{{ draws.length }}</strong> de {{ total }}
      </p>
      <p class="hero__thanks">¡Gracias por jugar!</p>
    </main>

    <!-- No game yet -->
    <main v-else class="hero">
      <img
        v-if="!logoFailed"
        :src="logoUrl"
        :alt="logoAlt"
        class="hero__logo"
        @error="logoFailed = true"
      />
      <h1 v-if="settings.title.trim()" class="hero__title">{{ settings.title }}</h1>
      <h1 v-else class="sr-only">Bingo en directo</h1>
      <p v-if="settings.subtitle.trim()" class="hero__subtitle">{{ settings.subtitle }}</p>
      <div class="hero__balls" aria-hidden="true">
        <span class="hero__ball" />
        <span class="hero__ball" />
        <span class="hero__ball" />
      </div>
      <p class="hero__status">La partida empezará en breve</p>
    </main>

    <Transition name="announce">
      <LiveAnnouncement
        v-if="overlay"
        :key="overlay.id"
        :announcement="overlay"
        :color="accent"
        :controls-visible="!idle"
        @dismiss="dismissAnnouncement"
      />
    </Transition>

    <LiveConnectionStatus :connected="connected" class="screen__connection" />

    <button
      v-if="canFullscreen"
      type="button"
      class="screen__fullscreen"
      :class="{ 'screen__fullscreen--hidden': idle }"
      :aria-label="isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'"
      :title="isFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'"
      @click="toggleFullscreen()"
    >
      <UIcon
        :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
        class="size-6"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
/* Smart TVs often run old browsers, so this screen sticks to viewport units
   and media queries (no container queries) and keeps color-mix() behind
   @supports, with plain fallbacks. */

/* ─── Theme ─────────────────────────────────────────────────────────────── */

.screen[data-theme='dark'] {
  color-scheme: dark;
  --scr-bg: #0b0b0f;
  --scr-glow-opacity: 0.22;
  --scr-fg: #fafafa;
  --scr-muted: #a1a1aa;
  --scr-surface: rgb(255 255 255 / 0.08);
  --scr-border: rgb(255 255 255 / 0.14);
  --scr-overlay: rgb(9 9 11 / 0.9);
  --scr-ball-shadow: rgb(0 0 0 / 0.65);
  --scr-accent-ink: var(--scr-fg);
}

.screen[data-theme='light'] {
  color-scheme: light;
  --scr-bg: #f4f4f5;
  --scr-glow-opacity: 0.3;
  --scr-fg: #18181b;
  --scr-muted: #52525b;
  --scr-surface: rgb(0 0 0 / 0.05);
  --scr-border: rgb(0 0 0 / 0.1);
  --scr-overlay: rgb(250 250 250 / 0.92);
  --scr-ball-shadow: rgb(0 0 0 / 0.28);
  --scr-accent-ink: var(--scr-fg);
}

@supports (color: color-mix(in oklab, red 50%, blue)) {
  .screen[data-theme='dark'] {
    --scr-accent-ink: color-mix(in oklab, var(--c) 80%, #fff);
  }

  .screen[data-theme='light'] {
    --scr-accent-ink: color-mix(in oklab, var(--c) 45%, #000);
  }
}

/* Fixed, so it is a stacking context and the glow can sit at z-index -1. */
.screen {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--scr-bg);
  color: var(--scr-fg);
}

/* Soft glow of the set colour behind everything. */
.screen::before {
  content: '';
  position: absolute;
  top: -20%;
  right: -10%;
  bottom: 0;
  left: -10%;
  z-index: -1;
  background: radial-gradient(ellipse at 50% 45%, var(--c), transparent 62%);
  opacity: var(--scr-glow-opacity);
  pointer-events: none;
}

.screen--idle {
  cursor: none;
}

/* ─── Header ────────────────────────────────────────────────────────────── */

.screen__header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2.5vw;
  box-sizing: border-box;
  height: 13vh;
  padding: 2vh 3vw 0;
}

.screen__logo {
  flex: none;
  height: 9vh;
  max-width: 28vw;
  object-fit: contain;
}

.screen__titles {
  min-width: 0;
}

.screen__title {
  margin: 0;
  overflow: hidden;
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-size: 4.4vh;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.screen__subtitle {
  margin: 0.3vh 0 0;
  overflow: hidden;
  color: var(--scr-muted);
  font-size: 2.5vh;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Stage ─────────────────────────────────────────────────────────────── */

.stage {
  flex: 1;
  min-height: 0;
}

/* Tall screens: ball, counter and previous draws stacked. */
.stage__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  justify-items: center;
  gap: 2.5vh;
  box-sizing: border-box;
  height: 100%;
  padding: 1vh 4vw 3vh;
}

.stage__ball {
  position: relative;
  grid-row: 1;
  width: min(84vw, 44vh);
}

.stage__counter {
  grid-row: 2;
  width: min(100%, 70vh);
  text-align: center;
}

.stage__recent {
  grid-row: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-height: 0;
}

/* Wide screens: counter, ball and previous draws side by side. The ball
   takes the height left under the 13vh header, minus room for its shadow. */
@media (min-aspect-ratio: 5/4) {
  .stage__grid {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    align-items: center;
    gap: 3vw;
    padding: 2vh 3vw 5vh;
  }

  .stage__ball {
    grid-column: 2;
    grid-row: 1;
    width: min(74vh, 46vw);
  }

  .stage__counter {
    grid-column: 1;
    grid-row: 1;
    width: 100%;
  }

  .stage__recent {
    grid-column: 3;
    grid-row: 1;
    justify-content: center;
    height: 74vh;
  }

  .counter__pre,
  .counter__n,
  .counter__of {
    display: block;
  }

  .counter__n {
    font-size: 19vh;
  }
}

/* Phone browsers measure vh without their address bar, so the sizes above
   would spill under it; svh is the height actually visible. Old TV browsers
   skip this block and keep vh, which is exact there. */
@supports (height: 1svh) {
  .screen__header {
    height: 13svh;
  }

  .screen__logo {
    height: 9svh;
  }

  .stage__ball {
    width: min(84vw, 44svh);
  }

  @media (min-aspect-ratio: 5/4) {
    .stage__ball {
      width: min(74svh, 46vw);
    }

    .stage__recent {
      height: 74svh;
    }
  }
}

.stage__ball-wrap {
  position: relative;
  will-change: transform;
}

/* Waiting for the first draw: the empty ball floats gently. */
.stage__ball-wrap--idle {
  animation: ball-float 3.2s ease-in-out infinite;
}

.stage__burst {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  border-radius: 9999px;
  background: var(--c);
  opacity: 0;
  pointer-events: none;
}

/* ─── Counter ───────────────────────────────────────────────────────────── */

.counter__game {
  display: -webkit-box;
  margin: 0 0 1.5vh;
  overflow: hidden;
  color: var(--scr-accent-ink);
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-size: 3.2vh;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.counter__text {
  margin: 0;
  font-size: 3.7vh;
  font-weight: 500;
  line-height: 1.1;
}

.counter__pre,
.counter__of {
  color: var(--scr-muted);
}

.counter__n {
  color: var(--scr-fg);
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-size: 1.6em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.counter__bar {
  width: min(100%, 35vh);
  height: max(6px, 1vh);
  margin: 2vh auto 0;
  overflow: hidden;
  border-radius: 9999px;
  background: var(--scr-surface);
  box-shadow: inset 0 0 0 1px var(--scr-border);
}

.counter__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--c);
  transition: width 0.8s ease;
}

/* ─── Previous draws ────────────────────────────────────────────────────── */

.recent__heading {
  margin: 0 0 2vh;
  color: var(--scr-muted);
  font-size: 2.3vh;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.recent__box {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.recent__hint {
  max-width: 40ch;
  margin: auto 0;
  color: var(--scr-muted);
  font-size: 3vh;
  font-weight: 500;
  text-align: center;
  text-wrap: balance;
}

/* ─── Waiting and finished ──────────────────────────────────────────────── */

.hero {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.4vh;
  min-height: 0;
  padding: 5vh 6vw;
  text-align: center;
}

.hero__logo {
  max-width: 70vw;
  height: 26vh;
  object-fit: contain;
}

.hero__logo--small {
  height: 14vh;
}

.hero__event {
  margin: 0;
  color: var(--scr-muted);
  font-size: 3vh;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero__title {
  margin: 0;
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-size: min(9vh, 8vw);
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.hero__subtitle,
.hero__game {
  margin: 0;
  color: var(--scr-muted);
  font-size: min(4vh, 4vw);
  font-weight: 500;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.hero__game {
  color: var(--scr-accent-ink);
  font-weight: 700;
}

.hero__summary {
  margin: 1vh 0 0;
  font-size: min(5vh, 5vw);
  font-weight: 500;
}

.hero__summary strong {
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-size: 1.3em;
}

.hero__thanks {
  margin: 0;
  color: var(--scr-muted);
  font-size: 3vh;
}

.hero__status {
  margin: 0;
  padding: 1.2vh 2.4vh;
  border: 1px solid var(--scr-border);
  border-radius: 9999px;
  background: var(--scr-surface);
  font-size: min(4.2vh, 5vw);
  font-weight: 700;
}

.hero__balls {
  display: flex;
  gap: 2.4vh;
  margin-top: 2vh;
}

.hero__ball {
  width: 5vh;
  height: 5vh;
  border-radius: 9999px;
  /* Shading drawn over the colour, so no color-mix() is needed. */
  background:
    radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.7), rgb(255 255 255 / 0) 40%),
    radial-gradient(circle at 50% 45%, rgb(0 0 0 / 0) 45%, rgb(0 0 0 / 0.4) 100%), var(--ball);
  animation: ball-bounce 1.4s ease-in-out infinite;
}

.hero__ball:nth-child(1) {
  --ball: #b0e0e6;
}

.hero__ball:nth-child(2) {
  --ball: #ffb6c1;
  animation-delay: 0.18s;
}

.hero__ball:nth-child(3) {
  --ball: #b4eeb4;
  animation-delay: 0.36s;
}

/* ─── Controls ──────────────────────────────────────────────────────────── */

.screen__connection {
  position: absolute;
  bottom: 1.25rem;
  left: 1.25rem;
  z-index: 50;
}

.screen__fullscreen {
  position: absolute;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border: 1px solid var(--scr-border);
  border-radius: 9999px;
  background: var(--scr-surface);
  color: var(--scr-fg);
  cursor: pointer;
  transition: opacity 0.5s ease;
}

.screen__fullscreen:hover {
  background: var(--scr-border);
}

.screen__fullscreen--hidden {
  opacity: 0;
  pointer-events: none;
}

.screen__fullscreen:focus-visible {
  outline: 3px solid var(--c);
  outline-offset: 2px;
  opacity: 1;
}

/* ─── Motion ────────────────────────────────────────────────────────────── */

.announce-enter-active,
.announce-leave-active {
  transition: opacity 0.4s ease;
}

.announce-enter-from,
.announce-leave-to {
  opacity: 0;
}

@keyframes ball-float {
  50% {
    transform: translateY(-2.5%);
  }
}

@keyframes ball-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  45% {
    transform: translateY(-2.4vh);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage__ball-wrap--idle,
  .hero__ball {
    animation: none;
  }

  .counter__fill {
    transition: none;
  }
}
</style>
