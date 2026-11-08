<script setup lang="ts">
import type { Announcement } from '#shared/types/api'

// Full-screen announcement for the public screen. It inherits the screen's
// --scr-* colour tokens, so it follows the public theme, not the site's.

const props = defineProps<{
  announcement: Announcement
  /** Colour of the current set, for the accents and the confetti. */
  color: string
  /** Whether pointer controls (the close button) should be visible. */
  controlsVisible: boolean
  /** The public screen uses its dark theme (fireworks glow there). */
  dark: boolean
}>()

const emit = defineEmits<{ dismiss: [] }>()

const FESTIVE = ['#f43f5e', '#f59e0b', '#facc15', '#10b981', '#3b82f6', '#a855f7']

const celebration = computed(() => props.announcement.kind !== 'message')
const title = computed(() => (props.announcement.kind === 'bingo' ? '¡BINGO!' : '¡LÍNEA!'))
const message = computed(() => props.announcement.text?.trim() || '¡Atención!')
const note = computed(() => (celebration.value ? props.announcement.text?.trim() : ''))
/** Notes can take up to 200 characters; long ones get a smaller font. */
const longNote = computed(() => (note.value?.length ?? 0) > 90)
const confettiColors = computed(() => [props.color, props.color, ...FESTIVE])

onKeyStroke('Escape', () => emit('dismiss'))
</script>

<template>
  <div
    class="announce"
    :class="`announce--${announcement.kind}`"
    :style="{ '--c': color }"
    @click="emit('dismiss')"
  >
    <!-- A line gets confetti; a bingo gets light rays and fireworks. -->
    <template v-if="announcement.kind === 'bingo'">
      <div class="announce__rays" aria-hidden="true" />
      <LiveFireworks
        :key="announcement.id"
        :colors="confettiColors"
        :duration="9000"
        :glow="dark"
      />
    </template>
    <LiveConfetti
      v-else-if="celebration"
      :key="announcement.id"
      :colors="confettiColors"
      :amount="120"
      :duration="4000"
    />

    <div role="alert" class="announce__content">
      <template v-if="celebration">
        <p class="announce__title">{{ title }}</p>
        <p v-if="announcement.cardCode" class="announce__card">
          <span class="announce__card-label">Cartón</span>
          <span class="announce__card-code">{{ announcement.cardCode }}</span>
        </p>
        <p v-if="note" class="announce__note" :class="{ 'announce__note--long': longNote }">
          {{ note }}
        </p>
      </template>
      <template v-else>
        <UIcon name="i-lucide-megaphone" class="announce__icon" aria-hidden="true" />
        <p class="announce__message">
          <LiveFitText :text="message" :max-ratio="0.34" :min="18" />
        </p>
        <p v-if="announcement.cardCode" class="announce__card">
          <span class="announce__card-label">Cartón</span>
          <span class="announce__card-code">{{ announcement.cardCode }}</span>
        </p>
      </template>
    </div>

    <button
      type="button"
      class="announce__close"
      :class="{ 'announce__close--hidden': !controlsVisible }"
      aria-label="Cerrar el aviso"
      @click.stop="emit('dismiss')"
    >
      <UIcon name="i-lucide-x" class="size-6" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.announce {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--scr-overlay);
  backdrop-filter: blur(8px);
}

/* Glow of the set colour, through opacity so no color-mix() is needed. */
.announce::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: radial-gradient(ellipse at 50% 45%, var(--c), transparent 65%);
  opacity: 0.32;
  pointer-events: none;
}

.announce__content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: min(3vh, 3vw);
  width: 100%;
  padding: 4vmin;
  text-align: center;
}

.announce__title {
  margin: 0;
  color: var(--scr-fg);
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-weight: 700;
  font-size: min(19vw, 30vh);
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-shadow:
    0.035em 0.035em 0 var(--c),
    0 0 0.3em var(--c);
  animation: announce-pop 0.9s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

.announce--bingo .announce__title {
  animation:
    announce-slam 0.75s cubic-bezier(0.3, 0, 0.2, 1) both,
    announce-pulse 1.6s ease-in-out 1.4s infinite;
}

/* The whole block shakes when the title lands. */
.announce--bingo .announce__content {
  animation: announce-shake 0.5s ease-out 0.45s both;
}

/* Light rays of the set colour turning slowly behind the title. Browsers
   without conic gradients (old smart TVs) simply skip them. */
.announce__rays {
  display: none;
}

@supports (background: conic-gradient(red, blue)) {
  .announce__rays {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    width: 160vmax;
    height: 160vmax;
    margin: -80vmax 0 0 -80vmax;
    border-radius: 9999px;
    background: repeating-conic-gradient(var(--c) 0deg 7deg, transparent 7deg 22.5deg);
    -webkit-mask-image: radial-gradient(closest-side, #000 8%, transparent 70%);
    mask-image: radial-gradient(closest-side, #000 8%, transparent 70%);
    opacity: 0;
    pointer-events: none;
    animation:
      announce-rays-in 1.2s ease-out 0.3s forwards,
      announce-spin 40s linear infinite;
  }
}

.announce__card {
  display: inline-flex;
  align-items: baseline;
  gap: 0.6em;
  margin: 0;
  padding: 0.35em 0.9em;
  border: max(2px, 0.35vmin) solid var(--c);
  border-radius: 9999px;
  background: var(--scr-surface);
  color: var(--scr-fg);
  font-size: min(5vw, 6.5vh);
  line-height: 1.2;
  animation: announce-rise 0.6s ease-out 0.35s both;
}

.announce__card-label {
  color: var(--scr-muted);
  font-size: 0.7em;
  font-weight: 500;
}

.announce__card-code {
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-weight: 700;
  letter-spacing: 0.04em;
}

/* Clamped as a safety net, so a long note never pushes the title off screen. */
.announce__note {
  display: -webkit-box;
  max-width: 85vw;
  margin: 0;
  overflow: hidden;
  color: var(--scr-fg);
  font-size: min(4.2vw, 5.5vh);
  font-weight: 500;
  line-height: 1.25;
  text-wrap: balance;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  animation: announce-rise 0.6s ease-out 0.5s both;
}

.announce__note--long {
  font-size: min(3vw, 4vh);
  -webkit-line-clamp: 5;
}

.announce__icon {
  width: min(12vw, 14vh);
  height: min(12vw, 14vh);
  color: var(--c);
  animation: announce-pop 0.7s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

.announce__message {
  width: 86vw;
  height: 48vh;
  margin: 0;
  color: var(--scr-fg);
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-weight: 700;
  font-size: 7vh;
  line-height: 1.15;
  animation: announce-rise 0.6s ease-out 0.15s both;
}

.announce__close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  background: var(--scr-surface);
  color: var(--scr-fg);
  transition: opacity 0.4s ease;
}

.announce__close:focus-visible {
  outline: 3px solid var(--c);
  outline-offset: 2px;
  opacity: 1;
}

.announce__close--hidden {
  opacity: 0;
}

@keyframes announce-pop {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(-8deg);
  }
  60% {
    opacity: 1;
    transform: scale(1.08) rotate(2deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}

@keyframes announce-slam {
  0% {
    opacity: 0;
    transform: scale(3.2);
  }
  55% {
    opacity: 1;
    transform: scale(0.9);
  }
  75% {
    transform: scale(1.06);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes announce-shake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  20% {
    transform: translate(-1.2vmin, 0.6vmin);
  }
  40% {
    transform: translate(1vmin, -0.8vmin);
  }
  60% {
    transform: translate(-0.6vmin, 0.4vmin);
  }
  80% {
    transform: translate(0.3vmin, -0.2vmin);
  }
}

@keyframes announce-rays-in {
  to {
    opacity: 0.22;
  }
}

@keyframes announce-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes announce-pulse {
  50% {
    transform: scale(1.05);
  }
}

@keyframes announce-rise {
  from {
    opacity: 0;
    transform: translateY(1.5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .announce__title,
  .announce--bingo .announce__title,
  .announce--bingo .announce__content,
  .announce__card,
  .announce__note,
  .announce__icon,
  .announce__message {
    animation: none;
  }

  .announce__rays {
    opacity: 0.22;
    animation: none;
  }
}
</style>
