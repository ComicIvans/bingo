<script setup lang="ts">
// Print layout: one card per page, or several per sheet with fronts and
// backs on consecutive pages.

import { PAPER_PRESETS } from '#shared/cards/design'
import { useGenerator } from '~/composables/generator/useGenerator'
import { paperPresetId } from '~/utils/generator/options'

const { options, design, printPlan } = useGenerator()

const MODES = [
  {
    label: 'Un cartón por página',
    value: 'single',
    description:
      'Cada página mide lo mismo que el cartón. Para imprentas o impresoras de tarjetas.',
  },
  {
    label: 'Varios por folio',
    value: 'sheet',
    description: 'Los cartones se colocan en folios del tamaño que elijas, listos para recortar.',
  },
]

const ORIENTATIONS = [
  { label: 'Automática (la que más cartones admite)', value: 'auto' },
  { label: 'Vertical', value: 'portrait' },
  { label: 'Horizontal', value: 'landscape' },
]

const FLIPS = [
  {
    label: 'Borde largo',
    value: 'long',
    description: 'Lo habitual al imprimir a doble cara («Dar la vuelta por el borde largo»).',
  },
  {
    label: 'Borde corto',
    value: 'short',
    description: 'Para impresoras configuradas para voltear por el borde corto.',
  },
]

const paperItems = [
  ...PAPER_PRESETS.map((preset) => ({ label: preset.label, value: preset.id })),
  { label: 'Personalizado', value: 'custom' },
]

// Picking "Personalizado" keeps the size; the flag stops the select from
// jumping back to the preset that size still matches.
const customPaper = ref(false)
const paper = computed({
  get: () => (customPaper.value ? 'custom' : paperPresetId(options.value.sheet)),
  set: (id: string) => {
    const hit = PAPER_PRESETS.find((p) => p.id === id)
    customPaper.value = !hit
    if (!hit) return
    options.value.sheet.paperWidth = hit.width
    options.value.sheet.paperHeight = hit.height
  },
})

const marginMax = computed(() =>
  Math.floor(Math.min(options.value.sheet.paperWidth, options.value.sheet.paperHeight) / 3)
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <URadioGroup
      v-model="options.sheet.mode"
      legend="Cómo se colocan los cartones"
      :items="MODES"
      variant="card"
      :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2', legend: 'mb-2 text-sm font-medium' }"
    />

    <template v-if="options.sheet.mode === 'sheet'">
      <UFormField label="Tamaño del folio">
        <USelect v-model="paper" :items="paperItems" value-key="value" class="w-full" />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <GeneratorNumberField
          v-model="options.sheet.paperWidth"
          label="Ancho del folio"
          unit="mm"
          :min="50"
          :max="1000"
          :step="0.5"
        />
        <GeneratorNumberField
          v-model="options.sheet.paperHeight"
          label="Alto del folio"
          unit="mm"
          :min="50"
          :max="1000"
          :step="0.5"
        />
      </div>
      <UFormField label="Orientación">
        <USelect
          v-model="options.sheet.orientation"
          :items="ORIENTATIONS"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <GeneratorNumberField
          v-model="options.sheet.margin"
          label="Margen del folio"
          unit="mm"
          :min="0"
          :max="marginMax"
          :step="0.5"
          description="Zona sin imprimir del borde."
        />
        <GeneratorNumberField
          v-model="options.sheet.gap"
          label="Separación entre cartones"
          unit="mm"
          :min="0"
          :max="50"
          :step="0.5"
          description="0 para cortes compartidos."
        />
      </div>

      <URadioGroup
        v-if="design.back.enabled"
        v-model="options.sheet.flip"
        legend="Volteo a doble cara"
        :items="FLIPS"
        variant="card"
        :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2', legend: 'mb-2 text-sm font-medium' }"
      />
      <p v-if="design.back.enabled" class="-mt-2 text-xs text-muted">
        Elige el mismo borde que en el diálogo de impresión. Cada folio lleva las caras delanteras
        en una página y los reversos en la siguiente; los reversos se colocan en espejo para que
        cada uno caiga justo detrás de su cartón.
      </p>

      <USwitch
        v-model="options.sheet.cropMarks"
        label="Marcas de corte"
        description="Pequeñas líneas en el margen del folio, alineadas con los bordes de los cartones."
      />
    </template>
    <p v-else-if="design.back.enabled" class="text-xs text-muted">
      Cada cartón ocupa dos páginas seguidas: la cara delantera y el reverso.
    </p>

    <UAlert
      :color="printPlan.error ? 'error' : 'neutral'"
      variant="subtle"
      :icon="printPlan.error ? 'i-lucide-triangle-alert' : 'i-lucide-printer'"
      :title="printPlan.text"
      :description="
        options.firstSheetOnly && !printPlan.error
          ? 'Solo la primera hoja (prueba de impresión).'
          : undefined
      "
      role="status"
    />
  </div>
</template>
