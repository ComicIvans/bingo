<script setup lang="ts">
// Picks one of the design's images by name (uploads and the panel logo).

import { useGenerator } from '~/composables/generator/useGenerator'

const props = defineProps<{
  allowNone?: boolean
  ariaLabel?: string
}>()

const model = defineModel<string | null>({ required: true })
const { design, images } = useGenerator()

// Reka's Select does not accept an empty string as a value.
const NONE = '__none__'

const items = computed(() => [
  ...(props.allowNone ? [{ label: 'Ninguna', value: NONE, icon: 'i-lucide-ban' }] : []),
  ...Object.entries(design.value.images).map(([id, image]) => ({
    label: image.name,
    value: id,
    avatar: {
      src: images.href(id),
      alt: '',
      ui: { image: 'object-contain', root: 'rounded-sm bg-white' },
    },
  })),
])

const value = computed({
  get: () => (model.value && design.value.images[model.value] ? model.value : NONE),
  set: (next: string) => {
    model.value = next === NONE ? null : next
  },
})
</script>

<template>
  <USelect
    v-model="value"
    :items="items"
    value-key="value"
    :aria-label="ariaLabel"
    placeholder="Elige una imagen"
    class="w-full"
  />
</template>
