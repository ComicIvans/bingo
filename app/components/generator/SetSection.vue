<script setup lang="ts">
// Set and card format.

import { FORMAT_LABELS, itemsPerCard } from '#shared/cards/grid'
import { useGenerator } from '~/composables/generator/useGenerator'
import {
  LOCAL_LABEL_MAX,
  LOCAL_NAME_MAX,
  LOCAL_SET_MAX_ITEMS,
  LOCAL_SET_NAME_MAX,
  clip,
  parseItemsText,
} from '~/utils/generator/csv'
import { baseName, pickFile, readFileText } from '~/utils/generator/files'
import { LOCAL_SET_VALUE, type FormatKind } from '~/utils/generator/options'

const { options, localSet, sets, activeSet, spec, specErrors } = useGenerator()
const toast = useToast()

const setItems = computed(() => [
  ...sets.list.value.map((set) => ({
    label: set.name,
    value: set.id,
    description: `${set.size} elementos${set.builtin ? '' : ' · creado en el panel'}`,
  })),
  { type: 'separator' as const },
  { label: 'Usar un conjunto propio', value: LOCAL_SET_VALUE, icon: 'i-lucide-file-up' },
])

const isLocal = computed(() => options.value.setId === LOCAL_SET_VALUE)
const summary = computed(() =>
  isLocal.value ? null : sets.list.value.find((set) => set.id === options.value.setId)
)
const sample = computed(() => activeSet.value?.items.slice(0, 30) ?? [])
const duplicates = ref<string[]>([])

async function importLocalSet() {
  const file = await pickFile('.csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values')
  if (!file) return
  try {
    const parsed = parseItemsText(await readFileText(file))
    localSet.value = {
      name: clip(baseName(file.name), LOCAL_SET_NAME_MAX) || 'Conjunto propio',
      color: localSet.value?.color ?? '#ff6b6b',
      items: parsed.items,
    }
    duplicates.value = parsed.duplicates
    options.value.setId = LOCAL_SET_VALUE
    const notes = [
      parsed.truncated
        ? `Se han descartado ${parsed.truncated} líneas por encima del máximo de ${LOCAL_SET_MAX_ITEMS} elementos.`
        : '',
      parsed.shortened
        ? `Se han recortado ${parsed.shortened} etiquetas o nombres demasiado largos (máximo ${LOCAL_LABEL_MAX} caracteres por etiqueta y ${LOCAL_NAME_MAX} por nombre).`
        : '',
    ].filter(Boolean)
    toast.add({
      title: 'Conjunto importado',
      description: [`${parsed.items.length} elementos.`, ...notes].join(' '),
      color: notes.length ? 'warning' : 'success',
      icon: 'i-lucide-file-check',
    })
  } catch (e) {
    toast.add({
      title: 'No se pudo importar el archivo',
      description: e instanceof Error ? e.message : 'Comprueba que sea un CSV o TXT de texto.',
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
}

function removeLocalSet() {
  localSet.value = null
  duplicates.value = []
  options.value.setId = sets.list.value[0]?.id ?? ''
}

const FORMATS: { label: string; value: FormatKind; description: string }[] = [
  {
    label: FORMAT_LABELS.classic90,
    value: 'classic90',
    description: 'Tres filas de nueve columnas con cinco elementos por fila.',
  },
  {
    label: FORMAT_LABELS.american75,
    value: 'american75',
    description: 'Cinco columnas, cada una con su tramo del conjunto.',
  },
  {
    label: FORMAT_LABELS.custom,
    value: 'custom',
    description: 'Elige filas, columnas y cuántas casillas se llenan.',
  },
]

const evenGrid = computed(
  () => options.value.custom.rows % 2 === 0 || options.value.custom.cols % 2 === 0
)
const perCard = computed(() => itemsPerCard(spec.value))
</script>

<template>
  <div class="flex flex-col gap-5">
    <UAlert
      v-if="sets.offline.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-wifi-off"
      title="Sin conexión con el servidor"
      description="Se muestran los conjuntos incluidos en la aplicación. Los creados en el panel no están disponibles."
    />

    <UFormField label="Conjunto" description="Los elementos que se imprimen en los cartones.">
      <USelect
        v-model="options.setId"
        :items="setItems"
        value-key="value"
        placeholder="Elige un conjunto"
        class="w-full"
      />
    </UFormField>

    <template v-if="isLocal">
      <div
        v-if="!localSet"
        class="flex flex-col items-start gap-3 rounded-lg border border-dashed border-accented p-4"
      >
        <p class="text-sm text-toned">
          Importa un archivo CSV o TXT con un elemento por línea:
          <code class="rounded bg-elevated px-1 font-mono">etiqueta;nombre</code>. También vale la
          coma o el tabulador, y el nombre es opcional. El conjunto solo se guarda en este
          navegador.
        </p>
        <UButton icon="i-lucide-file-up" label="Importar archivo" @click="importLocalSet" />
      </div>
      <div v-else class="flex flex-col gap-3 rounded-lg border border-default p-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Nombre del conjunto">
            <UInput v-model="localSet.name" :maxlength="LOCAL_SET_NAME_MAX" class="w-full" />
          </UFormField>
          <GeneratorColorField v-model="localSet.color" label="Color del conjunto" />
        </div>
        <UAlert
          v-if="duplicates.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-copy"
          title="Hay etiquetas repetidas"
          :description="`Aparecen más de una vez: ${duplicates.join(', ')}. En el cartón no se distinguirán.`"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            label="Cambiar archivo"
            color="neutral"
            variant="outline"
            size="sm"
            @click="importLocalSet"
          />
          <UButton
            icon="i-lucide-trash-2"
            label="Quitar conjunto"
            color="error"
            variant="ghost"
            size="sm"
            @click="removeLocalSet"
          />
        </div>
      </div>
    </template>

    <div v-if="sets.loading.value" class="flex flex-col gap-2" aria-busy="true">
      <USkeleton class="h-4 w-2/3" />
      <USkeleton class="h-8 w-full" />
    </div>
    <UAlert
      v-else-if="!isLocal && sets.error.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-x"
      :title="sets.error.value"
      :actions="[
        {
          label: 'Reintentar',
          color: 'neutral',
          variant: 'outline',
          onClick: () => void sets.select(options.setId),
        },
      ]"
    />
    <div v-else-if="activeSet" class="flex flex-col gap-2">
      <p class="text-sm text-muted">
        <span v-if="summary?.description">{{ summary.description }} · </span>
        {{ activeSet.items.length }} elementos
      </p>
      <ul class="flex flex-wrap gap-1" aria-label="Algunos elementos del conjunto">
        <li
          v-for="item in sample"
          :key="item.index"
          class="glyphs min-w-7 rounded border border-default bg-elevated px-1.5 py-0.5 text-center text-sm"
          :title="item.name"
        >
          {{ item.label }}
        </li>
        <li v-if="activeSet.items.length > sample.length" class="px-1.5 py-0.5 text-sm text-muted">
          y {{ activeSet.items.length - sample.length }} más
        </li>
      </ul>
    </div>

    <USeparator />

    <URadioGroup
      v-model="options.formatKind"
      legend="Formato del cartón"
      :items="FORMATS"
      variant="card"
      class="w-full"
      :ui="{ fieldset: 'grid gap-2 sm:grid-cols-3', legend: 'mb-2 text-sm font-medium' }"
    />

    <USwitch
      v-if="options.formatKind === 'american75'"
      v-model="options.americanFreeCenter"
      label="Casilla central libre"
      description="La casilla del centro no lleva elemento y cuenta como marcada."
    />

    <div v-if="options.formatKind === 'custom'" class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <GeneratorNumberField v-model="options.custom.rows" label="Filas" :min="1" :max="12" />
        <GeneratorNumberField v-model="options.custom.cols" label="Columnas" :min="1" :max="12" />
        <GeneratorNumberField
          v-model="options.custom.perRow"
          label="Casillas llenas por fila"
          :min="1"
          :max="12"
        />
        <GeneratorNumberField
          v-model="options.custom.maxPerColumn"
          label="Máximo por columna"
          :min="1"
          :max="12"
        />
      </div>
      <USwitch
        v-model="options.custom.columnOrder"
        label="Columnas por tramos"
        description="Cada columna toma un tramo consecutivo del conjunto, como en el bingo clásico."
      />
      <USwitch
        v-if="options.custom.columnOrder"
        v-model="options.custom.sortColumns"
        label="Ordenar cada columna"
        description="De menor a mayor de arriba abajo, como en el bingo de 90 bolas. Sin ordenar, como en el de 75, las filas de arriba no se llevan siempre los más bajos."
      />
      <USwitch
        v-model="options.custom.freeCenter"
        label="Casilla central libre"
        :description="
          evenGrid
            ? 'Necesita un número impar de filas y de columnas.'
            : 'La casilla del centro no lleva elemento y cuenta como marcada.'
        "
        :disabled="evenGrid"
      />
    </div>

    <UAlert
      v-if="specErrors.length"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Este formato no sirve con el conjunto elegido"
    >
      <template #description>
        <ul class="list-disc ps-4">
          <li v-for="error in specErrors" :key="error">{{ error }}</li>
        </ul>
      </template>
    </UAlert>
    <p v-else-if="activeSet" class="text-sm text-muted">
      Cada cartón lleva {{ perCard }} {{ perCard === 1 ? 'elemento' : 'elementos' }}.
    </p>
  </div>
</template>

<style scoped>
.glyphs {
  font-family: 'Montserrat', var(--font-glyphs, ui-sans-serif, system-ui, sans-serif);
}
</style>
