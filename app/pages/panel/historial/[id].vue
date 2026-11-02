<script setup lang="ts">
import type { AnnouncementKind } from '#shared/types/api'

definePageMeta({ layout: 'panel', middleware: 'admin' })

const route = useRoute()
const admin = useAdmin()
const confirm = usePanelConfirm()
const toast = useToast()

const id = computed(() => String(route.params.id))

const {
  data: game,
  status,
  refresh,
} = await useAsyncData(
  () => `panel-game-${id.value}`,
  () => admin.game(id.value)
)

useHead({ title: () => game.value?.name ?? 'Partida' })

// Follow the live game while it is the one shown here.
const { state } = useLiveState()
watch(
  () => {
    const live = state.value?.game
    return live && live.id === id.value
      ? `${live.status}/${live.draws.length}/${live.name}/${state.value?.announcement?.id}`
      : null
  },
  (key, previous) => {
    if (key && previous && key !== previous) refresh()
  }
)

const KIND_LABELS: Record<AnnouncementKind, string> = {
  line: 'Línea',
  bingo: 'Bingo',
  message: 'Mensaje',
}
const KIND_ICONS: Record<AnnouncementKind, string> = {
  line: 'i-lucide-minus',
  bingo: 'i-lucide-trophy',
  message: 'i-lucide-message-square-text',
}

const items = computed(() => new Map((game.value?.set.items ?? []).map((i) => [i.index, i])))

const draws = computed(() =>
  (game.value?.draws ?? []).map((draw, position) => {
    const item = items.value.get(draw.index)
    return {
      position: position + 1,
      index: draw.index,
      label: item?.label ?? String(draw.index),
      name: item?.name ?? '',
      at: draw.at,
    }
  })
)

const lines = computed(() => game.value?.announcements.filter((a) => a.kind === 'line').length ?? 0)
const bingos = computed(
  () => game.value?.announcements.filter((a) => a.kind === 'bingo').length ?? 0
)

function exportCsv() {
  const record = game.value
  if (!record) return
  const rows: (string | number)[][] = [
    ['Orden', 'Índice', 'Etiqueta', 'Nombre', 'Fecha', 'Hora'],
    ...draws.value.map((d) => [
      d.position,
      d.index,
      d.label,
      d.name,
      new Intl.DateTimeFormat('es-ES', { dateStyle: 'short' }).format(new Date(d.at)),
      formatPanelTime(d.at),
    ]),
  ]
  const day = record.startedAt.slice(0, 10)
  downloadPanelFile(
    `${panelSlug(record.name)}-${day}.csv`,
    buildPanelCsv(rows),
    'text/csv;charset=utf-8'
  )
}

async function remove() {
  const record = game.value
  if (!record) return
  const ok = await confirm({
    title: '¿Borrar la partida del historial?',
    description: `Se borrará «${record.name}» con todas sus bolas y anuncios. Esta acción no se puede deshacer.`,
    confirmLabel: 'Borrar',
    color: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (ok && (await admin.deleteGame(record.id))) {
    toast.add({ title: 'Partida borrada', color: 'success', icon: 'i-lucide-trash-2' })
    await navigateTo('/panel/historial')
  }
}
</script>

<template>
  <UDashboardPanel id="panel-historial-detalle">
    <template #header>
      <UDashboardNavbar :title="game?.name ?? 'Partida'">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
          <UButton
            to="/panel/historial"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Volver al historial"
          />
        </template>
        <template v-if="game" #right>
          <UButton
            label="Exportar CSV"
            icon="i-lucide-file-spreadsheet"
            color="neutral"
            variant="outline"
            aria-label="Exportar CSV"
            :ui="{ label: 'hidden sm:inline' }"
            :disabled="!draws.length"
            @click="exportCsv"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Borrar la partida"
            :disabled="game.status === 'running' || admin.pending.value"
            @click="remove"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="status === 'pending' && !game" class="space-y-4">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-64 w-full" />
      </div>

      <UEmpty
        v-else-if="!game"
        icon="i-lucide-search-x"
        title="No se ha encontrado la partida"
        description="Puede que se haya borrado del historial."
        :actions="[
          { label: 'Volver al historial', to: '/panel/historial', icon: 'i-lucide-arrow-left' },
        ]"
      />

      <div v-else class="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <UCard>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-muted">Estado</dt>
              <dd class="mt-0.5">
                <UBadge
                  :label="game.status === 'running' ? 'En curso' : 'Terminada'"
                  :color="game.status === 'running' ? 'success' : 'neutral'"
                  variant="subtle"
                />
              </dd>
            </div>
            <div>
              <dt class="text-muted">Conjunto</dt>
              <dd class="mt-0.5 flex items-center gap-1.5 font-medium">
                <span
                  class="size-2.5 rounded-full ring-1 ring-default"
                  :style="{ backgroundColor: game.set.color }"
                  aria-hidden="true"
                />
                {{ game.set.name }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">Pantalla pública</dt>
              <dd class="mt-0.5 font-medium">{{ panelDisplayLabel(game.publicDisplay) }}</dd>
            </div>
            <div>
              <dt class="text-muted">Bolas sacadas</dt>
              <dd class="mt-0.5 font-medium tabular-nums">
                {{ game.draws.length }} de {{ game.set.items.length }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">Inicio</dt>
              <dd class="mt-0.5 font-medium">
                <NuxtTime
                  :datetime="game.startedAt"
                  locale="es-ES"
                  date-style="medium"
                  time-style="short"
                />
              </dd>
            </div>
            <div>
              <dt class="text-muted">Fin</dt>
              <dd class="mt-0.5 font-medium">
                <NuxtTime
                  v-if="game.finishedAt"
                  :datetime="game.finishedAt"
                  locale="es-ES"
                  date-style="medium"
                  time-style="short"
                />
                <span v-else class="text-muted">—</span>
              </dd>
            </div>
            <div>
              <dt class="text-muted">Duración</dt>
              <dd class="mt-0.5 font-medium">
                {{ formatPanelDuration(game.startedAt, game.finishedAt) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">Líneas / bingos</dt>
              <dd class="mt-0.5 font-medium tabular-nums">{{ lines }} / {{ bingos }}</dd>
            </div>
          </dl>
        </UCard>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Bolas en orden de salida
                <span class="font-normal text-muted">({{ draws.length }})</span>
              </h2>
            </template>
            <p v-if="!draws.length" class="p-4 text-sm text-muted sm:p-6">
              No salió ninguna bola en esta partida.
            </p>
            <ol v-else class="max-h-[32rem] divide-y divide-default overflow-y-auto">
              <li
                v-for="draw in draws"
                :key="draw.index"
                class="flex items-center gap-3 px-4 py-2 text-sm sm:px-6"
              >
                <span class="w-8 shrink-0 text-right text-muted tabular-nums">
                  {{ draw.position }}.
                </span>
                <span
                  class="inline-flex min-w-10 justify-center rounded-md bg-elevated px-2 py-0.5 font-semibold text-highlighted tabular-nums"
                >
                  {{ draw.label }}
                </span>
                <span class="min-w-0 flex-1 truncate">
                  {{ draw.name !== draw.label ? draw.name : '' }}
                </span>
                <NuxtTime
                  :datetime="draw.at"
                  locale="es-ES"
                  hour="2-digit"
                  minute="2-digit"
                  second="2-digit"
                  class="shrink-0 text-muted tabular-nums"
                />
              </li>
            </ol>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Anuncios
                <span class="font-normal text-muted">({{ game.announcements.length }})</span>
              </h2>
            </template>
            <p v-if="!game.announcements.length" class="p-4 text-sm text-muted sm:p-6">
              No se hizo ningún anuncio.
            </p>
            <ul v-else class="divide-y divide-default">
              <li
                v-for="announcement in game.announcements"
                :key="announcement.id"
                class="flex items-start gap-3 px-4 py-3 text-sm sm:px-6"
              >
                <UIcon
                  :name="KIND_ICONS[announcement.kind]"
                  class="mt-0.5 size-4 shrink-0"
                  :class="announcement.kind === 'message' ? 'text-muted' : 'text-success'"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-highlighted">{{ KIND_LABELS[announcement.kind] }}</p>
                  <p v-if="announcement.text" class="break-words text-default">
                    {{ announcement.text }}
                  </p>
                  <ULink
                    v-if="announcement.cardCode"
                    :to="{
                      path: '/panel/comprobar',
                      query: { code: announcement.cardCode, game: game.id },
                    }"
                    class="font-mono text-primary hover:underline"
                  >
                    Cartón {{ announcement.cardCode }}
                  </ULink>
                </div>
                <NuxtTime
                  :datetime="announcement.at"
                  locale="es-ES"
                  hour="2-digit"
                  minute="2-digit"
                  class="shrink-0 text-muted tabular-nums"
                />
              </li>
            </ul>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
