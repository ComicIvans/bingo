<script setup lang="ts">
// Font, size and colour of one text of the card.

import type { TextStyle } from '#shared/cards/design'

const props = withDefaults(
  defineProps<{
    /**
     * What the text is, appended to every label ("del título") so fields stay
     * distinguishable when a section has several text styles.
     */
    subject?: string
    maxSize?: number
  }>(),
  { subject: '', maxSize: 120 }
)

const model = defineModel<TextStyle>({ required: true })

const labels = computed(() =>
  props.subject
    ? {
        font: `Fuente ${props.subject}`,
        size: `Tamaño ${props.subject}`,
        color: `Color ${props.subject}`,
      }
    : { font: 'Fuente', size: 'Tamaño de letra', color: 'Color del texto' }
)

function patch(change: Partial<TextStyle>) {
  model.value = { ...model.value, ...change }
}
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField :label="labels.font" class="sm:col-span-2">
      <GeneratorFontSelect
        :model-value="model.font"
        @update:model-value="(font: string) => patch({ font })"
      />
    </UFormField>
    <GeneratorNumberField
      :label="labels.size"
      unit="pt"
      :min="2"
      :max="maxSize"
      :step="0.5"
      :model-value="model.size"
      @update:model-value="(size: number) => patch({ size })"
    />
    <GeneratorColorField
      :label="labels.color"
      :model-value="model.color"
      @update:model-value="(color: string) => patch({ color })"
    />
  </div>
</template>
