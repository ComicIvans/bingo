<script setup lang="ts">
// Import, export and reset of the card design.

import type { DropdownMenuItem } from '@nuxt/ui'
import { useGenerator } from '~/composables/generator/useGenerator'

const { importDesign, exportDesign, resetDesign, exporter } = useGenerator()
const confirmReset = ref(false)

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Importar diseño', icon: 'i-lucide-file-input', onSelect: () => void importDesign() },
    { label: 'Exportar diseño', icon: 'i-lucide-file-output', onSelect: exportDesign },
  ],
  [
    {
      label: 'Restablecer diseño',
      icon: 'i-lucide-rotate-ccw',
      color: 'error',
      onSelect: () => (confirmReset.value = true),
    },
  ],
])

function reset() {
  resetDesign()
  confirmReset.value = false
}
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-palette"
      trailing-icon="i-lucide-chevron-down"
      label="Diseño"
      color="neutral"
      variant="outline"
      :disabled="exporter.busy.value"
    />
  </UDropdownMenu>

  <UModal
    v-model:open="confirmReset"
    title="¿Restablecer el diseño?"
    description="El cartón vuelve al diseño inicial y se pierden las imágenes y fuentes subidas. El conjunto, el lote y las opciones de impresión no cambian."
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancelar" color="neutral" variant="outline" @click="confirmReset = false" />
        <UButton label="Restablecer" color="error" icon="i-lucide-rotate-ccw" @click="reset" />
      </div>
    </template>
  </UModal>
</template>
