<script setup lang="ts">
// Header or footer band of the card front.

import { useGenerator } from '~/composables/generator/useGenerator'

const props = defineProps<{ band: 'header' | 'footer' }>()
const { design } = useGenerator()

const maxHeight = computed(() => Math.max(5, Math.floor(design.value.height / 2)))
</script>

<template>
  <div class="flex flex-col gap-4">
    <GeneratorNumberField
      v-model="design[props.band].height"
      label="Alto de la franja"
      unit="mm"
      :min="0"
      :max="maxHeight"
      :step="0.5"
      description="Con 0 la franja desaparece y la cuadrícula ocupa su sitio."
    />
    <template v-if="design[props.band].height > 0">
      <GeneratorTextStyleFields v-model="design[props.band].style" />
      <div class="grid gap-3 sm:grid-cols-3">
        <GeneratorSlotField v-model="design[props.band].left" label="Izquierda" />
        <GeneratorSlotField v-model="design[props.band].center" label="Centro" />
        <GeneratorSlotField v-model="design[props.band].right" label="Derecha" />
      </div>
      <p class="text-xs text-muted">
        Los textos se reducen solos si no caben. El código identifica cada cartón para comprobarlo
        en el panel.
      </p>
    </template>
  </div>
</template>
