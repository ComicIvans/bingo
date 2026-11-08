<script setup lang="ts">
// One slot of the header or footer: nothing, a text, an image or the card code.

import { SERVER_LOGO_ID, type SlotContent } from '#shared/cards/design'
import { useGenerator } from '~/composables/generator/useGenerator'

type TextSlot = Extract<SlotContent, { type: 'text' }>

const props = defineProps<{ label: string }>()
const model = defineModel<SlotContent>({ required: true })
const { design } = useGenerator()

const TYPES: { label: string; value: SlotContent['type'] }[] = [
  { label: 'Nada', value: 'none' },
  { label: 'Texto', value: 'text' },
  { label: 'Imagen', value: 'image' },
  { label: 'Código del cartón', value: 'code' },
]

// Remembered so switching to another type and back does not lose the text
// or its style.
const lastText = ref<TextSlot>(
  model.value.type === 'text' ? { ...model.value } : { type: 'text', text: '' }
)
const lastImage = ref(model.value.type === 'image' ? model.value.imageId : SERVER_LOGO_ID)

const type = computed({
  get: () => model.value.type,
  set: (next: SlotContent['type']) => {
    if (next === 'text') model.value = { ...lastText.value }
    else if (next === 'image')
      model.value = {
        type: 'image',
        imageId: design.value.images[lastImage.value] ? lastImage.value : SERVER_LOGO_ID,
      }
    else model.value = { type: next }
  },
})

function patchText(change: Partial<Omit<TextSlot, 'type'>>) {
  if (model.value.type !== 'text') return
  const next: TextSlot = { ...model.value, ...change }
  // Keep designs small: a style that is off is left out.
  if (!next.bold) delete next.bold
  if (!next.italic) delete next.italic
  lastText.value = next
  model.value = next
}

const text = computed({
  get: () => (model.value.type === 'text' ? model.value.text : ''),
  set: (value: string) => patchText({ text: value }),
})
const bold = computed(() => model.value.type === 'text' && !!model.value.bold)
const italic = computed(() => model.value.type === 'text' && !!model.value.italic)

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
    <UFieldGroup v-if="model.type === 'text'" class="w-full">
      <UInput
        v-model="text"
        :aria-label="`Texto (${props.label.toLowerCase()})`"
        placeholder="Escribe el texto"
        class="min-w-0 flex-1"
      />
      <UTooltip text="Negrita">
        <UButton
          icon="i-lucide-bold"
          color="neutral"
          :variant="bold ? 'solid' : 'outline'"
          :aria-pressed="bold"
          :aria-label="`Negrita (${props.label.toLowerCase()})`"
          @click="patchText({ bold: !bold })"
        />
      </UTooltip>
      <UTooltip text="Cursiva">
        <UButton
          icon="i-lucide-italic"
          color="neutral"
          :variant="italic ? 'solid' : 'outline'"
          :aria-pressed="italic"
          :aria-label="`Cursiva (${props.label.toLowerCase()})`"
          @click="patchText({ italic: !italic })"
        />
      </UTooltip>
    </UFieldGroup>
    <GeneratorImageSelect
      v-else-if="model.type === 'image'"
      v-model="imageId"
      :aria-label="`Imagen (${props.label.toLowerCase()})`"
    />
  </div>
</template>
