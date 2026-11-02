<script setup lang="ts">
// Batch: how many cards, their numbers, and the id and seed that identify them.

import { cardCode } from '#shared/cards/grid'
import { useGenerator } from '~/composables/generator/useGenerator'
import { COUNT_MAX, COUNT_MIN, LAST_NUMBER_MAX, lastNumberOf } from '~/utils/generator/options'

const { options, exporter, defaultBatchName, regenerateBatch } = useGenerator()

const firstMax = computed(() => LAST_NUMBER_MAX - options.value.count + 1)
watch(firstMax, (max) => {
  if (options.value.firstNumber > max) options.value.firstNumber = max
})

const range = computed(() => {
  const o = options.value
  const last = lastNumberOf(o)
  return { first: cardCode(o.batchId, o.firstNumber, last), last: cardCode(o.batchId, last, last) }
})

const showSeed = ref(false)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <GeneratorNumberField
        v-model="options.count"
        label="Número de cartones"
        :min="COUNT_MIN"
        :max="COUNT_MAX"
      />
      <GeneratorNumberField
        v-model="options.firstNumber"
        label="Primer número"
        :min="1"
        :max="firstMax"
      />
    </div>

    <UFormField label="Nombre del lote" description="Para reconocerlo en el panel.">
      <UInput
        v-model="options.batchName"
        :placeholder="defaultBatchName"
        maxlength="120"
        class="w-full"
      />
    </UFormField>

    <div class="flex flex-col gap-3 rounded-lg border border-default p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-medium text-highlighted">
            Lote <span class="font-mono">{{ options.batchId }}</span>
          </p>
          <p class="text-xs text-muted">
            Códigos del <span class="font-mono">{{ range.first }}</span> al
            <span class="font-mono">{{ range.last }}</span>
          </p>
        </div>
        <UBadge
          v-if="exporter.isRegistered.value"
          color="success"
          variant="subtle"
          icon="i-lucide-badge-check"
          label="Registrado en el panel"
        />
      </div>
      <UFormField label="Semilla">
        <UFieldGroup class="w-full">
          <UInput
            :model-value="showSeed ? options.seed : '•'.repeat(options.seed.length)"
            readonly
            class="w-full min-w-0"
            :ui="{ base: 'font-mono' }"
          />
          <UButton
            color="neutral"
            variant="outline"
            :icon="showSeed ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :aria-label="showSeed ? 'Ocultar la semilla' : 'Mostrar la semilla'"
            @click="showSeed = !showSeed"
          />
        </UFieldGroup>
      </UFormField>
      <p class="text-xs text-muted">
        El identificador forma parte del código impreso en cada cartón. La semilla decide qué
        elementos lleva cada uno: con ella se pueden reconstruir todos, así que no la compartas.
      </p>
      <UButton
        icon="i-lucide-dices"
        label="Generar otro lote"
        color="neutral"
        variant="outline"
        class="self-start"
        :disabled="exporter.busy.value"
        @click="regenerateBatch"
      />
    </div>
  </div>
</template>
