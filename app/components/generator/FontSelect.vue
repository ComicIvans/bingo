<script setup lang="ts">
// Font picker grouped by category; every option is shown in its own font.
// Fonts are registered with the FontFace API only when the list opens.

import { useGenerator } from '~/composables/generator/useGenerator'
import {
  ensureFontFace,
  fontFamilyStyle,
  fontGroups,
  fontLabel,
  fontSource,
} from '~/utils/generator/fonts'

defineProps<{
  /** Accessible name when the select has no visible label of its own. */
  ariaLabel?: string
}>()

const model = defineModel<string>({ required: true })
const { design } = useGenerator()

const groups = computed(() => fontGroups(design.value, model.value))

const items = computed(() =>
  groups.value.map((group) => [
    // Group headings are not selectable; the value only keeps the item shape uniform.
    { type: 'label' as const, label: group.label, value: `group:${group.label}` },
    ...group.fonts.map((font) => ({ label: font.label, value: font.id })),
  ])
)

function register(ids: string[]) {
  for (const id of ids) ensureFontFace(id, fontSource(design.value, id))
}

watch(model, (id) => register([id]), { immediate: true })

function onOpen(open: boolean) {
  if (open) register(groups.value.flatMap((group) => group.fonts.map((font) => font.id)))
}
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="value"
    :search-input="{ placeholder: 'Buscar fuente…' }"
    :aria-label="ariaLabel"
    class="w-full"
    @update:open="onOpen"
  >
    <template #default>
      <span class="truncate" :style="{ fontFamily: fontFamilyStyle(model) }">
        {{ fontLabel(design, model) }}
      </span>
    </template>
    <template #item-label="{ item }">
      <span :style="{ fontFamily: fontFamilyStyle(String(item.value)) }">{{ item.label }}</span>
    </template>
    <template #empty>Ninguna fuente coincide.</template>
  </USelectMenu>
</template>
