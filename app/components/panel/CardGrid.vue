<script setup lang="ts">
import { EMPTY, FREE } from '#shared/cards/grid'
import type { CardCheck } from '#shared/cards/check'

// A checked card, drawn like the printed one: a framed grid where the numbers
// stand out and the empty cells recede. Drawn cells are filled, free cells
// starred and complete rows outlined.

const props = defineProps<{
  cells: number[][]
  labels: Record<number, string>
  check: CardCheck
}>()

const complete = computed(() => new Set(props.check.completeRows))
const columns = computed(() => props.cells[0]?.length ?? 1)

function cellText(value: number, marked: boolean) {
  if (value === EMPTY) return 'Casilla vacía'
  if (value === FREE) return 'Casilla libre'
  return `${props.labels[value] ?? value}: ${marked ? 'ha salido' : 'no ha salido'}`
}
</script>

<template>
  <div
    role="table"
    aria-label="Cartón comprobado"
    class="flex flex-col gap-1.5 rounded-xl bg-default p-1.5 ring-2 ring-accented sm:p-2"
  >
    <div
      v-for="(row, r) in cells"
      :key="r"
      role="row"
      class="grid gap-1 rounded-lg p-1 transition sm:gap-1.5"
      :class="complete.has(r) ? 'bg-success/10 ring-2 ring-success' : 'ring-1 ring-transparent'"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
      :aria-label="complete.has(r) ? `Fila ${r + 1}: completa` : `Fila ${r + 1}`"
    >
      <div
        v-for="(value, c) in row"
        :key="c"
        role="cell"
        class="cell flex h-12 min-w-0 items-center justify-center truncate rounded-md px-0.5 font-display text-lg font-bold tabular-nums sm:h-16 sm:text-2xl"
        :class="
          value === EMPTY
            ? 'cell--empty'
            : value === FREE
              ? 'bg-primary/15 text-primary'
              : check.marked[r]?.[c]
                ? 'bg-primary text-inverted shadow-sm'
                : 'bg-default text-highlighted ring-2 ring-accented'
        "
        :aria-label="cellText(value, !!check.marked[r]?.[c])"
      >
        <UIcon v-if="value === FREE" name="i-lucide-star" class="size-6" aria-hidden="true" />
        <span v-else-if="value !== EMPTY" aria-hidden="true">{{ labels[value] ?? value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Faint diagonal hatching: clearly "nothing here", without competing with the numbers. */
.cell--empty {
  background: repeating-linear-gradient(135deg, var(--ui-bg-elevated) 0 5px, transparent 5px 10px);
  opacity: 0.8;
}
</style>
