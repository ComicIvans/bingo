<script setup lang="ts">
import type { DrawnItem } from '#shared/types/api'
import type { PublicDisplay } from '#shared/types/bingo'

// Previous draws as small balls, laid out in the column count that makes them
// as big as possible inside the box the parent gives this component.

const props = withDefaults(
  defineProps<{
    /** Most recent first. */
    draws: DrawnItem[]
    color: string
    display: PublicDisplay
    /** Largest ball diameter, in px. */
    maxSize?: number
  }>(),
  { maxSize: Infinity }
)

/** Gap between balls, as a fraction of their diameter. */
const GAP = 0.22

const box = useTemplateRef<HTMLElement>('box')
const { width, height } = useElementSize(box)

const layout = computed(() => {
  const n = props.draws.length
  let best = { cols: 1, size: 0 }
  if (!n || !width.value || !height.value) return best
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const size = Math.min(
      width.value / (cols + GAP * (cols - 1)),
      height.value / (rows + GAP * (rows - 1))
    )
    if (size > best.size) best = { cols, size }
  }
  best.size = Math.floor(Math.min(best.size, props.maxSize))
  return best
})

const listStyle = computed(() => ({
  gridTemplateColumns: `repeat(${layout.value.cols}, ${layout.value.size}px)`,
  gap: `${Math.floor(layout.value.size * GAP)}px`,
}))

const minFont = computed(() => Math.max(5, Math.round(layout.value.size / 16)))
</script>

<template>
  <div ref="box" class="recent">
    <TransitionGroup
      v-if="layout.size > 0"
      tag="ol"
      name="recent"
      class="recent__list"
      :style="listStyle"
    >
      <li v-for="draw in draws" :key="draw.index" class="recent__item">
        <LiveBall :item="draw" :color="color" :display="display" :min-font="minFont" />
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.recent {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.recent__list {
  position: relative;
  display: grid;
  justify-content: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent__item {
  min-width: 0;
}

.recent-move {
  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.recent-enter-active {
  transition:
    opacity 0.5s ease 0.15s,
    transform 0.6s cubic-bezier(0.2, 1.3, 0.4, 1) 0.15s;
}

.recent-enter-from {
  opacity: 0;
  transform: scale(0.4);
}

/* Out of the grid at once, so the others can slide into place. */
.recent-leave-active {
  position: absolute;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .recent-move,
  .recent-enter-active {
    transition: none;
  }
}
</style>
