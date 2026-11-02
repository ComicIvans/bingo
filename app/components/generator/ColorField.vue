<script setup lang="ts">
// Colour input: a swatch that opens a picker, next to an editable hex code.
// The code only reaches the model once it is a valid colour.

defineProps<{
  label: string
  description?: string
}>()

const model = defineModel<string>({ required: true })

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

function normalise(value: string): string | null {
  const match = value.trim().match(HEX)
  if (!match) return null
  const hex = match[1]!.length === 3 ? [...match[1]!].map((c) => c + c).join('') : match[1]!
  return `#${hex.toLowerCase()}`
}

const text = ref(model.value)
watch(model, (value) => {
  if (normalise(text.value) !== normalise(value)) text.value = value
})

function onInput(value: string | number) {
  text.value = String(value)
  const colour = normalise(text.value)
  if (colour && colour !== model.value) model.value = colour
}

function onBlur() {
  text.value = normalise(model.value) ?? model.value
}

const picker = computed({
  get: () => normalise(model.value) ?? '#000000',
  set: (value: string | undefined) => {
    const colour = value ? normalise(value) : null
    if (colour && colour !== model.value) model.value = colour
  },
})
</script>

<template>
  <UFormField :label="label" :description="description">
    <UFieldGroup class="w-full">
      <UPopover>
        <UButton
          color="neutral"
          variant="outline"
          class="shrink-0 px-2"
          :aria-label="`Elegir color: ${label}`"
        >
          <span
            class="block size-5 rounded-sm border border-accented"
            :style="{ backgroundColor: model }"
          />
        </UButton>
        <template #content>
          <div class="p-3">
            <UColorPicker v-model="picker" />
          </div>
        </template>
      </UPopover>
      <UInput
        :model-value="text"
        class="w-full min-w-0"
        :ui="{ base: 'font-mono' }"
        spellcheck="false"
        autocomplete="off"
        maxlength="7"
        @update:model-value="onInput"
        @blur="onBlur"
      />
    </UFieldGroup>
  </UFormField>
</template>
