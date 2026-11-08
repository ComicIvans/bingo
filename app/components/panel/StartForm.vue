<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { defaultBatchIds } from '#shared/cards/inPlay'
import type { PublicDisplay } from '#shared/types/bingo'

const admin = useAdmin()
const toast = useToast()

const { data: sets, status } = await useAsyncData('panel-sets', () => admin.sets())
// For the batches in play: the batches, and past games to pick the default ones.
const { data: batches } = await useAsyncData('start-batches', () => admin.batches())
const { data: history } = await useAsyncData('start-history', () => admin.history())

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ponle un nombre a la partida.')
    .max(80, 'Como máximo 80 caracteres.'),
  setId: z.string({ error: 'Elige un conjunto.' }).min(1, 'Elige un conjunto.'),
  publicDisplay: z.enum(['label', 'name', 'both']),
})
type Schema = z.output<typeof schema>

const form = reactive<{
  name: string
  setId: string | undefined
  publicDisplay: PublicDisplay
  batchIds: string[]
}>({
  name: `Partida del ${formatPanelLongDate()}`,
  setId: undefined,
  publicDisplay: 'label',
  batchIds: [],
})

/** Only batches of the chosen set can be in play. */
const batchItems = computed(() =>
  (batches.value ?? [])
    .filter((batch) => batch.setId === form.setId)
    .map((batch) => ({
      value: batch.id,
      label: `${batch.id} · ${batch.name}`,
      description: `Cartones del ${batch.firstNumber} al ${batch.firstNumber + batch.count - 1}`,
    }))
)

function defaultBatches(setId: string | undefined): string[] {
  if (!setId) return []
  return defaultBatchIds(
    setId,
    batches.value ?? [],
    (history.value ?? []).map((game) => ({
      setId: game.setId,
      startedAt: game.startedAt,
      batchIds: game.batchIds ?? [],
    }))
  )
}

const setItems = computed(() =>
  (sets.value ?? []).map((set) => ({
    value: set.id,
    label: set.name,
    description: set.description,
    color: set.color,
    size: set.size,
    builtin: set.builtin,
  }))
)

// Preselect the first set; follow the chosen set's default display.
watch(
  sets,
  (list) => {
    if (!form.setId && list?.length) form.setId = list[0]!.id
  },
  { immediate: true }
)
watch(
  () => form.setId,
  (id) => {
    const set = sets.value?.find((s) => s.id === id)
    if (set) form.publicDisplay = set.publicDisplay
    // Batches of another set are never kept.
    form.batchIds = defaultBatches(id)
  },
  { immediate: true }
)
watch([batches, history], () => (form.batchIds = defaultBatches(form.setId)))

async function start(event: FormSubmitEvent<Schema>) {
  const state = await admin.startGame({
    name: event.data.name,
    setId: event.data.setId,
    publicDisplay: event.data.publicDisplay,
    batchIds: form.batchIds,
  })
  if (state)
    toast.add({
      title: 'Partida empezada',
      description: `«${event.data.name}» ya está en la pantalla pública.`,
      color: 'success',
      icon: 'i-lucide-play',
    })
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-display text-lg font-bold text-highlighted">Nueva partida</h2>
      <p class="text-sm text-muted">Elige el conjunto de bolas y empieza a sacar.</p>
    </template>

    <UForm :schema="schema" :state="form" class="space-y-6" @submit="start">
      <UFormField name="name" label="Nombre de la partida" required>
        <UInput v-model="form.name" class="w-full" size="lg" maxlength="80" />
      </UFormField>

      <UFormField name="setId">
        <div v-if="status === 'pending'" class="grid gap-2 sm:grid-cols-2">
          <USkeleton v-for="n in 3" :key="n" class="h-16" />
        </div>
        <UAlert
          v-else-if="!setItems.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-library"
          title="No hay conjuntos disponibles"
          description="Crea uno en la sección Conjuntos."
        />
        <URadioGroup
          v-else
          v-model="form.setId"
          legend="Conjunto"
          required
          :items="setItems"
          variant="card"
          :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2', item: 'items-center' }"
        >
          <template #label="{ item }">
            <span class="flex items-center gap-2">
              <span
                class="size-3.5 shrink-0 rounded-full ring-1 ring-default"
                :style="{ backgroundColor: item.color }"
                aria-hidden="true"
              />
              <span class="truncate">{{ item.label }}</span>
              <UBadge
                v-if="item.builtin"
                label="Predefinido"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </span>
          </template>
          <template #description="{ item }">
            <span>{{ item.size }} elementos</span>
            <span v-if="item.description" class="line-clamp-1"> · {{ item.description }}</span>
          </template>
        </URadioGroup>
      </UFormField>

      <UFormField
        name="batchIds"
        label="Lotes en juego"
        :help="
          batchItems.length
            ? 'Los cartones que hay en la sala. Los voluntarios solo tendrán que escribir el número del cartón.'
            : undefined
        "
      >
        <USelectMenu
          v-if="batchItems.length"
          v-model="form.batchIds"
          :items="batchItems"
          value-key="value"
          multiple
          placeholder="Ningún lote"
          :search-input="false"
          class="w-full"
        />
        <p v-else class="text-sm text-muted">
          Este conjunto no tiene lotes. Se registran al descargar los cartones en PDF desde el
          generador.
        </p>
      </UFormField>

      <UFormField name="publicDisplay">
        <URadioGroup
          v-model="form.publicDisplay"
          legend="La pantalla pública muestra"
          :items="PANEL_DISPLAY_OPTIONS"
          orientation="horizontal"
          variant="table"
        />
      </UFormField>

      <UButton
        type="submit"
        label="Empezar partida"
        icon="i-lucide-play"
        size="xl"
        block
        :loading="admin.pending.value"
        :disabled="!setItems.length"
      />
    </UForm>
  </UCard>
</template>
