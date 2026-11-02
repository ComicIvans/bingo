<script setup lang="ts">
import type { LiveGame } from '#shared/types/api'

// Summary of the last finished game, shown next to the start form.

const props = defineProps<{ game: LiveGame }>()

const admin = useAdmin()

// LiveGame carries no announcements: lines and bingos come from the record.
const { data: record } = useAsyncData(
  () => `panel-summary-${props.game.id}`,
  () => admin.game(props.game.id)
)
const summary = computed(() => {
  const announcements = record.value?.announcements
  if (!announcements) return null
  return {
    lines: announcements.filter((a) => a.kind === 'line').length,
    bingos: announcements.filter((a) => a.kind === 'bingo').length,
  }
})

const lastDraws = computed(() => props.game.draws.slice(-12).reverse())
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold tracking-wide text-muted uppercase">Última partida</p>
          <h2 class="truncate font-display text-lg font-bold text-highlighted">{{ game.name }}</h2>
        </div>
        <UBadge label="Terminada" color="neutral" variant="subtle" icon="i-lucide-flag" />
      </div>
    </template>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <div>
        <dt class="text-muted">Conjunto</dt>
        <dd class="flex items-center gap-1.5 font-medium">
          <span
            class="size-2.5 rounded-full ring-1 ring-default"
            :style="{ backgroundColor: game.color }"
            aria-hidden="true"
          />
          {{ game.setName }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">Bolas sacadas</dt>
        <dd class="font-medium">{{ game.draws.length }} de {{ game.total }}</dd>
      </div>
      <div>
        <dt class="text-muted">Inicio</dt>
        <dd class="font-medium">
          <NuxtTime
            :datetime="game.startedAt"
            locale="es-ES"
            date-style="medium"
            time-style="short"
          />
        </dd>
      </div>
      <div>
        <dt class="text-muted">Duración</dt>
        <dd class="font-medium">{{ formatPanelDuration(game.startedAt, game.finishedAt) }}</dd>
      </div>
      <div v-if="summary">
        <dt class="text-muted">Líneas cantadas</dt>
        <dd class="font-medium">{{ summary.lines }}</dd>
      </div>
      <div v-if="summary">
        <dt class="text-muted">Bingos cantados</dt>
        <dd class="font-medium">{{ summary.bingos }}</dd>
      </div>
    </dl>

    <div v-if="lastDraws.length" class="mt-4">
      <p class="mb-2 text-sm text-muted">Últimas bolas</p>
      <ul
        class="flex flex-wrap gap-1.5"
        aria-label="Últimas bolas, de la más reciente a la más antigua"
      >
        <li v-for="draw in lastDraws" :key="draw.index">
          <UBadge :label="draw.label" color="neutral" variant="outline" :title="draw.name" />
        </li>
      </ul>
    </div>

    <template #footer>
      <UButton
        :to="`/panel/historial/${game.id}`"
        label="Ver en el historial"
        icon="i-lucide-history"
        color="neutral"
        variant="outline"
        block
      />
    </template>
  </UCard>
</template>
