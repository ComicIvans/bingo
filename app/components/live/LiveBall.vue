<script setup lang="ts">
import type { BingoItem, PublicDisplay } from '#shared/types/bingo'

// A bingo ball in the set colour with a white face, so the ink is always dark
// and readable whatever colour the set uses. It fills the width it is given.

const props = withDefaults(
  defineProps<{
    item: BingoItem | null
    color: string
    display: PublicDisplay
    /** Shown faded when there is no item yet. */
    placeholder?: string
    /** Smallest font size, in px (smaller balls need a lower floor). */
    minFont?: number
  }>(),
  { placeholder: '?', minFont: 8 }
)

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl|hwb|lab|lch|oklab|oklch)a?\([\d\s.,%/+-]+\)|[a-z]+)$/i

const safeColor = computed(() => (SAFE_COLOR.test(props.color.trim()) ? props.color : '#f43f5e'))

// Spoken text follows what the ball shows: in 'name' games the label is the
// answer players look for, so it must not leak through assistive text either.
const spoken = computed(() => {
  const item = props.item
  if (!item) return 'Bola sin sacar'
  if (props.display === 'label') return item.label
  if (props.display === 'name') return item.name
  return `${item.label}, ${item.name}`
})
</script>

<template>
  <div
    class="ball"
    :class="[`ball--${display}`, { 'ball--empty': !item }]"
    :style="{ '--c': safeColor }"
    role="img"
    :aria-label="spoken"
  >
    <div class="ball__face" aria-hidden="true">
      <template v-if="item">
        <span v-if="display !== 'name'" class="ball__label">
          <LiveFitText :text="item.label" :min="minFont" />
        </span>
        <span v-if="display !== 'label'" class="ball__name">
          <LiveFitText
            :text="item.name"
            :max-ratio="display === 'name' ? 0.45 : 1"
            :min="minFont"
          />
        </span>
      </template>
      <span v-else class="ball__label ball__placeholder">
        <LiveFitText :text="placeholder" :max-ratio="0.8" :min="minFont" />
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Square through padding and shaded by layers drawn over the colour, which
   also works on the old browsers of many smart TVs (no aspect-ratio or
   color-mix needed). */
.ball {
  position: relative;
  width: 100%;
  height: 0;
  padding-bottom: 100%;
  border-radius: 9999px;
  background:
    radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0) 32%),
    radial-gradient(circle at 50% 42%, rgb(0 0 0 / 0) 45%, rgb(0 0 0 / 0.42) 100%), var(--c);
}

/* Darker ring around the face. */
.ball::before {
  content: '';
  position: absolute;
  top: 11.5%;
  right: 11.5%;
  bottom: 11.5%;
  left: 11.5%;
  border-radius: 9999px;
  background: linear-gradient(rgb(0 0 0 / 0.28), rgb(0 0 0 / 0.28)), var(--c);
}

/* Floor shadow, kept outside the ball so it needs no stacking tricks. */
.ball::after {
  content: '';
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: -8%;
  height: 6%;
  border-radius: 9999px;
  background: radial-gradient(closest-side, var(--scr-ball-shadow, rgb(0 0 0 / 0.35)), transparent);
  pointer-events: none;
}

.ball__face {
  position: absolute;
  top: 14%;
  right: 14%;
  bottom: 14%;
  left: 14%;
  border-radius: 9999px;
  background: radial-gradient(circle at 42% 34%, #fff 55%, #e9e9ec 100%);
  color: #18181b;
  font-family: 'Lexend Deca', var(--font-glyphs);
  font-weight: 700;
  line-height: 1.05;
  /* The cqh sizes below only shape the first paint: LiveFitText sets px sizes
     once mounted, and browsers without container units just ignore them. */
  container-type: size;
}

.ball__label,
.ball__name {
  position: absolute;
  display: block;
}

/* Text boxes stay inside the circle of the face. */
.ball--label .ball__label,
.ball--empty .ball__label {
  top: 24%;
  left: 9%;
  right: 9%;
  height: 52%;
  font-size: 40cqh;
  line-height: 1;
}

.ball--name .ball__name {
  top: 22%;
  left: 10%;
  right: 10%;
  height: 56%;
  font-size: 9cqh;
}

.ball--both .ball__label {
  top: 20%;
  left: 12%;
  right: 12%;
  height: 42%;
  font-size: 30cqh;
  line-height: 1;
}

.ball--both .ball__name {
  top: 64%;
  left: 18%;
  right: 18%;
  height: 18%;
  font-size: 8cqh;
}

.ball__placeholder {
  color: #a1a1aa;
}
</style>
