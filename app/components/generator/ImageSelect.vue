<script setup lang="ts">
// Picks one of the design's images by name (uploads and the panel logo), or
// uploads a new one and picks it.

import { useGenerator } from '~/composables/generator/useGenerator'
import { useImageUpload } from '~/composables/generator/useImageUpload'

const props = defineProps<{
  allowNone?: boolean
  ariaLabel?: string
}>()

const model = defineModel<string | null>({ required: true })
const { design, images } = useGenerator()
const { upload, uploading } = useImageUpload()

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

async function uploadAndPick() {
  const id = await upload('Ya está elegida aquí y también puedes usarla en el resto del cartón.')
  if (id) model.value = id
}
</script>

<template>
  <UFieldGroup class="w-full">
    <USelect
      v-model="value"
      :items="items"
      value-key="value"
      :aria-label="ariaLabel"
      placeholder="Elige una imagen"
      class="min-w-0 flex-1"
    />
    <UTooltip text="Subir imagen">
      <UButton
        icon="i-lucide-image-up"
        color="neutral"
        variant="outline"
        :loading="uploading"
        aria-label="Subir una imagen nueva"
        @click="uploadAndPick"
      />
    </UTooltip>
  </UFieldGroup>
</template>
