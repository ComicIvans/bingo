<script setup lang="ts">
// PDF download, batch registration status and the batch file for the panel.

import { useGenerator } from '~/composables/generator/useGenerator'

const { exporter, options, printPlan, canGenerate, fonts, activeSet, specErrors } = useGenerator()
const { session, authenticated, status, progress, busy, isRegistered } = exporter

// Someone may log in to the panel in another tab while the generator is open.
useEventListener('focus', () => {
  if (!busy.value) void exporter.refreshSession()
})

const statusText = computed(() => {
  switch (status.value) {
    case 'registering':
      return 'Registrando el lote en el panel…'
    case 'preparing':
      return 'Preparando fuentes e imágenes…'
    case 'generating': {
      const p = progress.value
      if (!p || p.phase === 'cards') return 'Generando los cartones…'
      // Embedding the fonts happens after the last page and takes a moment.
      if (p.done >= p.total) return 'Guardando el PDF…'
      return `Dibujando la página ${p.done.toLocaleString('es-ES')} de ${p.total.toLocaleString('es-ES')}…`
    }
    default:
      return ''
  }
})

const progressValue = computed(() => {
  const p = progress.value
  if (status.value !== 'generating' || !p || p.phase !== 'pages' || !p.total) return null
  return Math.round((p.done / p.total) * 100)
})

const disabledReason = computed(() => {
  if (!activeSet.value) return 'Elige un conjunto.'
  if (specErrors.value.length) return 'Corrige el formato del cartón.'
  if (printPlan.value.error) return printPlan.value.error
  if (!fonts.engine.value) return 'Cargando fuentes…'
  return null
})
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4 flex flex-col gap-4', header: 'p-3 sm:px-4' }">
    <template #header>
      <h2 class="font-display text-base font-bold text-highlighted">Descargar PDF</h2>
      <p class="text-sm text-muted" role="status">{{ printPlan.text }}</p>
    </template>

    <UCheckbox
      v-model="options.firstSheetOnly"
      label="Solo la primera hoja (prueba de impresión)"
      description="Para comprobar márgenes, colores y el volteo antes de imprimir todo el lote. No registra el lote."
      :disabled="busy"
    />

    <template v-if="authenticated">
      <template v-if="!options.firstSheetOnly">
        <UAlert
          v-if="isRegistered"
          color="success"
          variant="subtle"
          icon="i-lucide-badge-check"
          :title="`Lote ${options.batchId} registrado`"
          description="Los cartones de este lote se pueden comprobar desde el panel."
        />
        <UAlert
          v-else
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="El lote se registrará en el panel"
          description="Al generar el PDF, el lote queda guardado en el panel para poder comprobar los cartones durante la partida."
        />
      </template>
    </template>
    <template v-else>
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="El lote no se registrará"
        :description="
          session?.configured === false
            ? 'Los cartones solo se pueden comprobar desde el panel si el lote está registrado, y el panel todavía no está configurado. Descarga la ficha del lote para importarla más adelante.'
            : 'Los cartones solo se pueden comprobar desde el panel si el lote está registrado. Inicia sesión en el panel antes de generar el PDF, o descarga la ficha del lote e impórtala allí.'
        "
        :actions="
          session?.configured === false
            ? undefined
            : [
                {
                  label: 'Abrir el panel',
                  to: '/panel',
                  target: '_blank',
                  color: 'neutral',
                  variant: 'outline',
                  trailingIcon: 'i-lucide-external-link',
                },
              ]
        "
      />
      <div class="flex flex-col gap-1">
        <UButton
          icon="i-lucide-file-json"
          label="Descargar ficha del lote (.json)"
          color="neutral"
          variant="outline"
          class="self-start"
          :disabled="!activeSet || busy"
          @click="exporter.downloadBatchFile"
        />
        <p class="text-xs text-muted">
          Incluye la semilla, con la que se reconstruyen todos los cartones: guárdala en un lugar
          seguro.
        </p>
      </div>
    </template>

    <div v-if="busy" class="flex flex-col gap-2" aria-live="polite">
      <UProgress :model-value="progressValue" :max="100" size="md" />
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-toned">{{ statusText }}</p>
        <UButton
          icon="i-lucide-x"
          label="Cancelar"
          color="neutral"
          variant="outline"
          size="sm"
          @click="exporter.cancel"
        />
      </div>
    </div>
    <div v-else class="flex flex-col gap-1.5">
      <UButton
        icon="i-lucide-file-down"
        :label="options.firstSheetOnly ? 'Generar hoja de prueba' : 'Generar PDF'"
        size="lg"
        block
        :disabled="!canGenerate"
        @click="exporter.generate()"
      />
      <p v-if="disabledReason" class="text-center text-xs text-muted">{{ disabledReason }}</p>
    </div>
  </UCard>
</template>
