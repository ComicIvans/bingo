<script setup lang="ts">
import { EMPTY, FREE } from '#shared/cards/grid'
import type { CardCheck } from '#shared/cards/check'

// A checked card: drawn cells marked, free cells starred, complete rows outlined.

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
  <div role="table" aria-label="Cartón comprobado" class="flex flex-col gap-1.5">
    <div
      v-for="(row, r) in cells"
      :key="r"
      role="row"
      class="grid gap-1 rounded-lg p-1 transition"
      :class="complete.has(r) ? 'bg-success/10 ring-2 ring-success' : 'ring-1 ring-transparent'"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
      :aria-label="complete.has(r) ? `Fila ${r + 1}: completa` : `Fila ${r + 1}`"
    >
      <div
        v-for="(value, c) in row"
        :key="c"
        role="cell"
        class="flex h-11 min-w-0 items-center justify-center truncate rounded-md px-0.5 text-sm font-semibold tabular-nums sm:h-14 sm:text-lg"
        :class="
          value === EMPTY
            ? 'bg-elevated/70'
            : value === FREE
              ? 'bg-primary/15 text-primary'
              : check.marked[r]?.[c]
                ? 'bg-primary text-inverted'
                : 'bg-default text-default ring-1 ring-default'
        "
        :aria-label="cellText(value, !!check.marked[r]?.[c])"
      >
        <UIcon v-if="value === FREE" name="i-lucide-star" class="size-5" aria-hidden="true" />
        <span v-else-if="value !== EMPTY" aria-hidden="true">{{ labels[value] ?? value }}</span>
      </div>
    </div>
  </div>
</template>
