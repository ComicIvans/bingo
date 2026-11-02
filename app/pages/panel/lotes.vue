<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CardBatch, CardBatchSummary } from '#shared/types/api'
import { FORMAT_LABELS, cardCode, type CardFormat } from '#shared/cards/grid'

definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Lotes' })

const admin = useAdmin()
const confirm = usePanelConfirm()
const toast = useToast()

const {
  data: batches,
  status,
  refresh,
} = await useAsyncData('panel-batches', () => admin.batches())

const columns: TableColumn<CardBatchSummary>[] = [
  { accessorKey: 'id', header: 'Lote' },
  { accessorKey: 'name', header: 'Nombre' },
  { accessorKey: 'setName', header: 'Conjunto' },
  { id: 'format', header: 'Formato' },
  { accessorKey: 'count', header: 'Cartones' },
  { id: 'range', header: 'Numeración' },
  { accessorKey: 'createdAt', header: 'Creado' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Acciones') },
]

function formatLabel(format: CardFormat) {
  if (format.kind === 'custom') return `${FORMAT_LABELS.custom} (${format.rows} × ${format.cols})`
  if (format.kind === 'american75' && format.freeCenter)
    return `${FORMAT_LABELS.american75}, centro libre`
  return FORMAT_LABELS[format.kind]
}

const lastNumber = (b: CardBatchSummary) => b.firstNumber + b.count - 1
const firstCode = (b: CardBatchSummary) => cardCode(b.id, b.firstNumber, lastNumber(b))
const lastCode = (b: CardBatchSummary) => cardCode(b.id, lastNumber(b), lastNumber(b))

// ─── Import ────────────────────────────────────────────────────────────────

// Only a sanity check that this is a batch file; the server validates every
// field and answers with a precise Spanish message.
function looksLikeBatch(value: unknown): value is CardBatch {
  const b = value as Partial<CardBatch> | null
  return !!b && typeof b === 'object' && typeof b.id === 'string' && typeof b.seed === 'string'
}

const importing = ref(false)
const { open: openFile, onChange } = useFileDialog({
  accept: '.json,application/json',
  multiple: false,
  reset: true,
})

onChange(async (files) => {
  const file = files?.[0]
  if (!file) return
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    data = null
  }
  if (!looksLikeBatch(data)) {
    toast.add({
      title: 'Archivo no válido',
      description: `«${file.name}» no es un archivo de lote exportado desde el generador.`,
      color: 'error',
      icon: 'i-lucide-file-x',
    })
    return
  }
  importing.value = true
  const summary = await admin.importBatch(data)
  importing.value = false
  if (summary) {
    toast.add({
      title: 'Lote importado',
      description: `${summary.id} · «${summary.name}» con ${summary.count} cartones.`,
      color: 'success',
      icon: 'i-lucide-file-check',
    })
    await refresh()
  }
})

async function remove(batch: CardBatchSummary) {
  const ok = await confirm({
    title: `¿Borrar el lote ${batch.id}?`,
    description: `Los ${batch.count} cartones de «${batch.name}» ya no se podrán comprobar desde el panel (salvo que vuelvas a importar el archivo del lote). Esta acción no se puede deshacer.`,
    confirmLabel: 'Borrar lote',
    color: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (ok && (await admin.deleteBatch(batch.id))) {
    toast.add({ title: 'Lote borrado', color: 'success', icon: 'i-lucide-trash-2' })
    await refresh()
  }
}
</script>

<template>
  <UDashboardPanel id="panel-lotes">
    <template #header>
      <UDashboardNavbar title="Lotes de cartones">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
        <template #right>
          <UButton
            label="Importar lote"
            icon="i-lucide-file-up"
            :loading="importing"
            @click="openFile()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4">
        <p class="max-w-3xl text-sm text-muted">
          Cada lote es una tanda de cartones generada con el generador. Registrados aquí, sus
          cartones se pueden comprobar por el código impreso. Si generaste los cartones sin
          conexión, importa el archivo <span class="font-mono">.json</span> del lote.
        </p>

        <UTable
          :data="batches ?? []"
          :columns="columns"
          :loading="status === 'pending'"
          sticky
          class="flex-1"
        >
          <template #id-cell="{ row }">
            <UBadge :label="row.original.id" color="neutral" variant="outline" class="font-mono" />
          </template>
          <template #name-cell="{ row }">
            <span class="font-medium text-highlighted">{{ row.original.name }}</span>
          </template>
          <template #format-cell="{ row }">
            {{ formatLabel(row.original.format) }}
          </template>
          <template #count-cell="{ row }">
            <span class="tabular-nums">{{ row.original.count }}</span>
          </template>
          <template #range-cell="{ row }">
            <span class="font-mono text-xs">
              {{ firstCode(row.original) }} – {{ lastCode(row.original) }}
            </span>
          </template>
          <template #createdAt-cell="{ row }">
            <NuxtTime
              :datetime="row.original.createdAt"
              locale="es-ES"
              date-style="medium"
              time-style="short"
            />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                :to="{ path: '/panel/comprobar', query: { code: firstCode(row.original) } }"
                label="Comprobar"
                icon="i-lucide-ticket-check"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Comprobar cartones del lote ${row.original.id}`"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="`Borrar el lote ${row.original.id}`"
                :disabled="admin.pending.value"
                @click="remove(row.original)"
              />
            </div>
          </template>
          <template #empty>
            <UEmpty
              icon="i-lucide-layers"
              title="No hay lotes registrados"
              description="Genera cartones en el generador o importa el archivo de un lote."
              variant="naked"
              :actions="[
                {
                  label: 'Abrir el generador',
                  icon: 'i-lucide-printer',
                  to: '/generador',
                  target: '_blank',
                },
                {
                  label: 'Importar lote',
                  icon: 'i-lucide-file-up',
                  color: 'neutral',
                  variant: 'outline',
                  onClick: () => openFile(),
                },
              ]"
            />
          </template>
        </UTable>
      </div>
    </template>
  </UDashboardPanel>
</template>
