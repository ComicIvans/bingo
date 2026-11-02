<script setup lang="ts">
import type { DrawnItem } from '#shared/types/api'
import type { BingoItem } from '#shared/types/bingo'

// Every item of the set; drawn ones highlighted, the last one emphasised.
// Clicking an undrawn item asks the page to mark it (physical drum).

const props = defineProps<{
  items: BingoItem[]
  draws: DrawnItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{ mark: [item: BingoItem] }>()

const position = computed(() => new Map(props.draws.map((d, i) => [d.index, i + 1])))
const lastIndex = computed(() => props.draws.at(-1)?.index)

// Number sets read best in rows of ten (1-10, 11-20…).
const columns = computed(() =>
  props.items.length >= 50 && props.items.length % 10 === 0
    ? 'repeat(10, minmax(0, 1fr))'
    : 'repeat(auto-fill, minmax(3.25rem, 1fr))'
)

function cellLabel(item: BingoItem) {
  const at = position.value.get(item.index)
  const name = item.name && item.name !== item.label ? `${item.label}, ${item.name}` : item.label
  return at ? `${name}: salió en el puesto ${at}` : `${name}: marcar como salido`
}
</script>

<template>
  <ul data-panel-board class="grid gap-1 sm:gap-1.5" :style="{ gridTemplateColumns: columns }">
    <li v-for="item in items" :key="item.index">
      <button
        type="button"
        class="flex h-10 w-full items-center justify-center truncate rounded-md px-0.5 text-sm font-semibold tabular-nums ring-1 transition sm:h-11 sm:text-base"
        :class="
          item.index === lastIndex
            ? 'z-[1] scale-105 bg-primary text-inverted shadow-md ring-primary outline-2 outline-offset-2 outline-primary'
            : position.has(item.index)
              ? 'bg-primary/15 text-highlighted ring-primary/40'
              : 'bg-default text-muted ring-default hover:bg-elevated hover:text-highlighted enabled:cursor-pointer disabled:cursor-not-allowed'
        "
        :title="item.name"
        :aria-label="cellLabel(item)"
        :aria-pressed="position.has(item.index)"
        :disabled="position.has(item.index) || disabled"
        @click="emit('mark', item)"
      >
        {{ item.label }}
      </button>
    </li>
  </ul>
</template>
