<script setup lang="ts">
// One slot of the header or footer: nothing, a text, an image or the card code.

import { SERVER_LOGO_ID, type SlotContent } from '#shared/cards/design'
import { useGenerator } from '~/composables/generator/useGenerator'

const props = defineProps<{ label: string }>()
const model = defineModel<SlotContent>({ required: true })
const { design } = useGenerator()

const TYPES: { label: string; value: SlotContent['type'] }[] = [
  { label: 'Nada', value: 'none' },
  { label: 'Texto', value: 'text' },
  { label: 'Imagen', value: 'image' },
  { label: 'Código del cartón', value: 'code' },
]

// Remembered so switching to another type and back does not lose the text.
const lastText = ref(model.value.type === 'text' ? model.value.text : '')
const lastImage = ref(model.value.type === 'image' ? model.value.imageId : SERVER_LOGO_ID)

const type = computed({
  get: () => model.value.type,
  set: (next: SlotContent['type']) => {
    if (next === 'text') model.value = { type: 'text', text: lastText.value }
    else if (next === 'image')
      model.value = {
        type: 'image',
        imageId: design.value.images[lastImage.value] ? lastImage.value : SERVER_LOGO_ID,
      }
    else model.value = { type: next }
  },
})

const text = computed({
  get: () => (model.value.type === 'text' ? model.value.text : ''),
  set: (value: string) => {
    lastText.value = value
    model.value = { type: 'text', text: value }
  },
})

const imageId = computed({
  get: () => (model.value.type === 'image' ? model.value.imageId : null),
  set: (value: string | null) => {
    if (!value) return
    lastImage.value = value
    model.value = { type: 'image', imageId: value }
  },
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <UFormField :label="props.label">
      <USelect v-model="type" :items="TYPES" value-key="value" class="w-full" />
    </UFormField>
    <UInput
      v-if="model.type === 'text'"
      v-model="text"
      :aria-label="`Texto (${props.label.toLowerCase()})`"
      placeholder="Escribe el texto"
      class="w-full"
    />
    <GeneratorImageSelect
      v-else-if="model.type === 'image'"
      v-model="imageId"
      :aria-label="`Imagen (${props.label.toLowerCase()})`"
    />
  </div>
</template>
