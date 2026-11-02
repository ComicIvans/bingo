<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { GameSummary } from '#shared/types/api'

definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Historial' })

const admin = useAdmin()
const confirm = usePanelConfirm()
const toast = useToast()

const { data: games, status, refresh } = await useAsyncData('panel-history', () => admin.history())

// A game that starts or ends elsewhere shows up without reloading.
const { state } = useLiveState()
watch(
  () => {
    const game = state.value?.game
    return game ? `${game.id}/${game.status}/${game.draws.length}/${game.name}` : ''
  },
  () => refresh()
)

const search = ref('')
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('es')
  const list = games.value ?? []
  return term
    ? list.filter((g) => `${g.name} ${g.setName}`.toLocaleLowerCase('es').includes(term))
    : list
})

const columns: TableColumn<GameSummary>[] = [
  { accessorKey: 'name', header: 'Partida' },
  { accessorKey: 'setName', header: 'Conjunto' },
  { accessorKey: 'startedAt', header: 'Inicio' },
  { accessorKey: 'finishedAt', header: 'Fin' },
  { id: 'duration', header: 'Duración' },
  { id: 'draws', header: 'Bolas' },
  { accessorKey: 'lines', header: 'Líneas' },
  { accessorKey: 'bingos', header: 'Bingos' },
  { accessorKey: 'status', header: 'Estado' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Acciones') },
]

async function remove(game: GameSummary) {
  const ok = await confirm({
    title: '¿Borrar la partida del historial?',
    description: `Se borrará «${game.name}» con todas sus bolas y anuncios. Esta acción no se puede deshacer.`,
    confirmLabel: 'Borrar',
    color: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (!ok) return
  if (await admin.deleteGame(game.id)) {
    toast.add({ title: 'Partida borrada', color: 'success', icon: 'i-lucide-trash-2' })
    await refresh()
  }
}
</script>

<template>
  <UDashboardPanel id="panel-historial">
    <template #header>
      <UDashboardNavbar title="Historial">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            aria-label="Actualizar"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Buscar por nombre o conjunto…"
            aria-label="Buscar partidas"
            class="w-full sm:w-72"
          />
        </template>
        <template #right>
          <span class="text-sm text-muted">
            {{ filtered.length }} {{ filtered.length === 1 ? 'partida' : 'partidas' }}
          </span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        :data="filtered"
        :columns="columns"
        :loading="status === 'pending'"
        sticky
        class="flex-1"
        :ui="{ td: 'whitespace-nowrap' }"
      >
        <template #name-cell="{ row }">
          <ULink
            :to="`/panel/historial/${row.original.id}`"
            class="font-medium text-highlighted hover:underline"
          >
            {{ row.original.name }}
          </ULink>
        </template>
        <template #setName-cell="{ row }">
          <span class="flex items-center gap-1.5">
            <span
              class="size-2.5 shrink-0 rounded-full ring-1 ring-default"
              :style="{ backgroundColor: row.original.color }"
              aria-hidden="true"
            />
            {{ row.original.setName }}
          </span>
        </template>
        <template #startedAt-cell="{ row }">
          <NuxtTime
            :datetime="row.original.startedAt"
            locale="es-ES"
            date-style="medium"
            time-style="short"
          />
        </template>
        <template #finishedAt-cell="{ row }">
          <NuxtTime
            v-if="row.original.finishedAt"
            :datetime="row.original.finishedAt"
            locale="es-ES"
            date-style="medium"
            time-style="short"
          />
          <span v-else class="text-muted">—</span>
        </template>
        <template #duration-cell="{ row }">
          {{ formatPanelDuration(row.original.startedAt, row.original.finishedAt) }}
        </template>
        <template #draws-cell="{ row }">
          <span class="tabular-nums">{{ row.original.drawCount }} / {{ row.original.total }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :label="row.original.status === 'running' ? 'En curso' : 'Terminada'"
            :color="row.original.status === 'running' ? 'success' : 'neutral'"
            variant="subtle"
          />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UTooltip text="Ver detalles">
              <UButton
                :to="`/panel/historial/${row.original.id}`"
                icon="i-lucide-eye"
                color="neutral"
                variant="ghost"
                :aria-label="`Ver los detalles de ${row.original.name}`"
              />
            </UTooltip>
            <UTooltip
              :text="
                row.original.status === 'running'
                  ? 'No se puede borrar la partida en curso'
                  : 'Borrar'
              "
            >
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                :disabled="row.original.status === 'running' || admin.pending.value"
                :aria-label="`Borrar ${row.original.name}`"
                @click="remove(row.original)"
              />
            </UTooltip>
          </div>
        </template>
        <template #empty>
          <UEmpty
            icon="i-lucide-history"
            :title="search ? 'No hay partidas que coincidan' : 'Todavía no hay partidas'"
            :description="
              search
                ? 'Prueba con otro nombre.'
                : 'Las partidas que juegues aparecerán aquí con sus bolas y anuncios.'
            "
            variant="naked"
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
