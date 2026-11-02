<script setup lang="ts">
import type { SetBody } from '#shared/types/api'
import type { BingoSetSummary } from '#shared/types/bingo'

definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Conjuntos' })

const admin = useAdmin()
const confirm = usePanelConfirm()
const toast = useToast()

const { data: sets, status, refresh } = await useAsyncData('panel-sets-list', () => admin.sets())

const editorOpen = ref(false)
const editorInitial = ref<{ id?: string; body: SetBody } | null>(null)
const loadingId = ref<string | null>(null)

const builtinSets = computed(() => (sets.value ?? []).filter((s) => s.builtin))
const customSets = computed(() => (sets.value ?? []).filter((s) => !s.builtin))

function createNew() {
  editorInitial.value = null
  editorOpen.value = true
}

async function openFrom(summary: BingoSetSummary, mode: 'edit' | 'duplicate') {
  loadingId.value = summary.id
  const set = await admin.set(summary.id)
  loadingId.value = null
  if (!set) return
  editorInitial.value = {
    id: mode === 'edit' ? set.id : undefined,
    body: {
      name: mode === 'edit' ? set.name : `${set.name} (copia)`,
      description: set.description,
      color: set.color,
      publicDisplay: set.publicDisplay,
      items: set.items.map(({ label, name }) => ({ label, name })),
    },
  }
  editorOpen.value = true
}

async function remove(set: BingoSetSummary) {
  const ok = await confirm({
    title: '¿Borrar el conjunto?',
    description: `Se borrará «${set.name}». Las partidas jugadas y los lotes registrados con él no se ven afectados. Esta acción no se puede deshacer.`,
    confirmLabel: 'Borrar',
    color: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (ok && (await admin.deleteSet(set.id))) {
    toast.add({ title: 'Conjunto borrado', color: 'success', icon: 'i-lucide-trash-2' })
    await refresh()
  }
}
</script>

<template>
  <UDashboardPanel id="panel-conjuntos">
    <template #header>
      <UDashboardNavbar title="Conjuntos">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
        <template #right>
          <UButton label="Nuevo conjunto" icon="i-lucide-plus" @click="createNew" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <p class="text-sm text-muted">
          Un conjunto es la lista de bolas de una partida: números, elementos químicos, símbolos…
          Los predefinidos no se pueden cambiar, pero puedes duplicarlos para crear el tuyo.
        </p>

        <div v-if="status === 'pending' && !sets" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <USkeleton v-for="n in 3" :key="n" class="h-36" />
        </div>

        <template v-else>
          <section
            v-for="group in [
              { title: 'Predefinidos', list: builtinSets },
              { title: 'Personalizados', list: customSets },
            ]"
            :key="group.title"
            :aria-label="group.title"
          >
            <h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
              {{ group.title }}
            </h2>

            <UEmpty
              v-if="!group.list.length"
              icon="i-lucide-library"
              title="Aún no hay conjuntos personalizados"
              description="Crea uno desde cero o duplica uno predefinido."
              variant="naked"
              :actions="[{ label: 'Nuevo conjunto', icon: 'i-lucide-plus', onClick: createNew }]"
            />

            <ul v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="set in group.list" :key="set.id">
                <UCard class="h-full" :ui="{ root: 'flex flex-col', body: 'flex-1' }">
                  <div class="flex items-start gap-3">
                    <span
                      class="mt-1 size-4 shrink-0 rounded-full ring-1 ring-default"
                      :style="{ backgroundColor: set.color }"
                      aria-hidden="true"
                    />
                    <div class="min-w-0 flex-1">
                      <h3 class="truncate font-semibold text-highlighted">{{ set.name }}</h3>
                      <p class="mt-0.5 text-sm text-muted">
                        {{ set.size }} elementos · Pantalla:
                        {{ panelDisplayLabel(set.publicDisplay) }}
                      </p>
                      <p v-if="set.description" class="mt-2 line-clamp-2 text-sm text-default">
                        {{ set.description }}
                      </p>
                    </div>
                    <UBadge
                      v-if="set.builtin"
                      label="Predefinido"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                  <template #footer>
                    <div class="flex flex-wrap gap-1">
                      <UButton
                        v-if="!set.builtin"
                        label="Editar"
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :loading="loadingId === set.id"
                        @click="openFrom(set, 'edit')"
                      />
                      <UButton
                        label="Duplicar"
                        icon="i-lucide-copy"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :loading="set.builtin && loadingId === set.id"
                        @click="openFrom(set, 'duplicate')"
                      />
                      <UButton
                        v-if="!set.builtin"
                        icon="i-lucide-trash-2"
                        color="error"
                        variant="ghost"
                        size="sm"
                        class="ms-auto"
                        :aria-label="`Borrar ${set.name}`"
                        :disabled="admin.pending.value"
                        @click="remove(set)"
                      />
                    </div>
                  </template>
                </UCard>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <PanelSetEditor v-model:open="editorOpen" :initial="editorInitial" @saved="refresh()" />
    </template>
  </UDashboardPanel>
</template>
