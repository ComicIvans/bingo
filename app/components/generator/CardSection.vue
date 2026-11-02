<script setup lang="ts">
// Card size, margins, background and outline.

import { CARD_SIZE_PRESETS } from '#shared/cards/design'
import { useGenerator } from '~/composables/generator/useGenerator'
import { matchPreset } from '~/utils/generator/options'

const { design } = useGenerator()

const presetItems = [
  ...CARD_SIZE_PRESETS.map((preset) => ({ label: preset.label, value: preset.id })),
  { label: 'Personalizado', value: 'custom' },
]

// Picking "Personalizado" keeps the size; the flag stops the select from
// jumping back to the preset that size still matches.
const customSize = ref(false)
const preset = computed({
  get: () =>
    customSize.value
      ? 'custom'
      : matchPreset(CARD_SIZE_PRESETS, design.value.width, design.value.height),
  set: (id: string) => {
    const hit = CARD_SIZE_PRESETS.find((p) => p.id === id)
    customSize.value = !hit
    if (!hit) return
    design.value.width = hit.width
    design.value.height = hit.height
  },
})

function rotate() {
  const { width, height } = design.value
  design.value.width = height
  design.value.height = width
}

const maxPadding = computed(() =>
  Math.max(0, Math.floor(Math.min(design.value.width, design.value.height) / 4))
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField label="Tamaño">
      <USelect v-model="preset" :items="presetItems" value-key="value" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
      <GeneratorNumberField
        v-model="design.width"
        label="Ancho"
        unit="mm"
        :min="20"
        :max="500"
        :step="0.5"
      />
      <GeneratorNumberField
        v-model="design.height"
        label="Alto"
        unit="mm"
        :min="20"
        :max="500"
        :step="0.5"
      />
      <UTooltip text="Girar el cartón">
        <UButton
          icon="i-lucide-rotate-cw-square"
          color="neutral"
          variant="outline"
          aria-label="Girar el cartón (intercambiar ancho y alto)"
          @click="rotate"
        />
      </UTooltip>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <GeneratorNumberField
        v-model="design.padding"
        label="Margen interior"
        unit="mm"
        :min="0"
        :max="maxPadding"
        :step="0.5"
      />
      <GeneratorNumberField
        v-model="design.spacing"
        label="Separación entre partes"
        unit="mm"
        :min="0"
        :max="30"
        :step="0.5"
      />
    </div>
    <GeneratorColorField v-model="design.background" label="Fondo" />
    <div class="grid gap-3 sm:grid-cols-3">
      <GeneratorColorField v-model="design.borderColor" label="Color del borde" />
      <GeneratorNumberField
        v-model="design.borderWidth"
        label="Grosor del borde"
        unit="mm"
        :min="0"
        :max="5"
        :step="0.05"
        description="0 sin borde"
      />
      <GeneratorNumberField
        v-model="design.borderRadius"
        label="Esquinas redondeadas"
        unit="mm"
        :min="0"
        :max="30"
        :step="0.5"
      />
    </div>
    <p class="text-xs text-muted">
      Con varios cartones por folio y sin separación entre ellos, el borde hace de línea de corte.
    </p>
  </div>
</template>
