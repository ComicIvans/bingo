<script setup lang="ts">
// Preview of the selected card (front and back) and of the first sheet.

import { SERVER_LOGO_ID, usedImageIds } from '#shared/cards/design'
import { useGenerator } from '~/composables/generator/useGenerator'
import { fontLabel } from '~/utils/generator/fonts'
import { LOCAL_SET_VALUE } from '~/utils/generator/options'

const { preview, options, design, fonts, specErrors, activeSet, sets, images, imposition } =
  useGenerator()
const { position, code, front, back, sheetFront, sheetBack, error, sheetVisible } = preview
const { missing, failed } = fonts

const tab = ref<'card' | 'sheet'>('card')
const tabs = computed(() => [
  { label: 'Cartón', value: 'card', icon: 'i-lucide-id-card' },
  ...(options.value.sheet.mode === 'sheet'
    ? [{ label: 'Primer folio', value: 'sheet', icon: 'i-lucide-file' }]
    : []),
])
watch(
  () => options.value.sheet.mode,
  (mode) => {
    if (mode === 'single') tab.value = 'card'
  }
)
watch(tab, (value) => (sheetVisible.value = value === 'sheet'), { immediate: true })

function setPosition(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return
  position.value = Math.min(options.value.count, Math.max(1, Math.round(value)))
}

const aspect = computed(() => design.value.width / design.value.height)
const portrait = computed(() => aspect.value < 1)
// Tall cards would push everything else off screen; cap their height.
const cardStyle = computed(() => ({
  width: `min(100%, ${Math.round(48 * aspect.value * 10) / 10}vh)`,
}))
const pageAspect = computed(() =>
  'error' in imposition.value ? 1 : imposition.value.pageWidth / imposition.value.pageHeight
)
const sheetStyle = computed(() => ({
  width: `min(100%, ${Math.round(56 * pageAspect.value * 10) / 10}vh)`,
}))

const blocked = computed(() => {
  if (sets.loading.value) return null
  if (!activeSet.value)
    return options.value.setId === LOCAL_SET_VALUE
      ? 'Importa un archivo con los elementos para ver la vista previa.'
      : 'Elige un conjunto para ver la vista previa.'
  if (specErrors.value.length) return 'Corrige el formato del cartón para ver la vista previa.'
  return null
})

const waiting = computed(() => !blocked.value && !front.value && !error.value)

const logoMissing = computed(
  () => images.logoUnavailable.value && usedImageIds(design.value).includes(SERVER_LOGO_ID)
)
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4', header: 'p-3 sm:px-4' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-base font-bold text-highlighted">Vista previa</h2>
        <div class="flex items-center gap-2">
          <UFieldGroup size="sm">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="outline"
              aria-label="Cartón anterior"
              :disabled="position <= 1"
              @click="setPosition(position - 1)"
            />
            <UInputNumber
              :model-value="position"
              :min="1"
              :max="options.count"
              :increment="false"
              :decrement="false"
              locale="es-ES"
              aria-label="Cartón que se muestra"
              class="w-16"
              :ui="{ base: 'text-center px-1' }"
              @update:model-value="setPosition"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="outline"
              aria-label="Cartón siguiente"
              :disabled="position >= options.count"
              @click="setPosition(position + 1)"
            />
          </UFieldGroup>
          <UBadge color="neutral" variant="soft" class="font-mono" :label="code" />
        </div>
      </div>
      <UTabs
        v-if="tabs.length > 1"
        v-model="tab"
        :items="tabs"
        :content="false"
        variant="link"
        size="sm"
        class="mt-2"
      />
    </template>

    <div class="flex flex-col gap-3">
      <div
        v-if="blocked"
        class="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-muted p-6 text-center text-sm text-muted"
      >
        <UIcon name="i-lucide-scan-eye" class="size-8" />
        {{ blocked }}
      </div>

      <div
        v-else-if="waiting"
        class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg bg-muted p-6"
        aria-busy="true"
      >
        <USkeleton class="aspect-[2/1] w-3/4 max-w-sm" />
        <p class="text-sm text-muted">Cargando fuentes…</p>
      </div>

      <template v-else-if="tab === 'card'">
        <div
          class="grid gap-3 rounded-lg bg-muted p-3 sm:p-4"
          :class="portrait && back ? 'grid-cols-2' : 'grid-cols-1'"
        >
          <figure class="flex min-w-0 flex-col items-center gap-1.5">
            <!-- eslint-disable-next-line vue/no-v-html -- SVG built by the card engine -->
            <div class="card-svg drop-shadow-md" :style="cardStyle" v-html="front" />
            <figcaption class="text-xs text-muted">Anverso</figcaption>
          </figure>
          <figure v-if="back" class="flex min-w-0 flex-col items-center gap-1.5">
            <!-- eslint-disable-next-line vue/no-v-html -- SVG built by the card engine -->
            <div class="card-svg drop-shadow-md" :style="cardStyle" v-html="back" />
            <figcaption class="text-xs text-muted">Reverso</figcaption>
          </figure>
        </div>
      </template>

      <template v-else>
        <div
          class="grid gap-3 rounded-lg bg-muted p-3 sm:p-4"
          :class="sheetBack ? 'sm:grid-cols-2' : 'grid-cols-1'"
        >
          <figure class="flex min-w-0 flex-col items-center gap-1.5">
            <!-- eslint-disable-next-line vue/no-v-html -- SVG built by the card engine -->
            <div class="card-svg shadow-md" :style="sheetStyle" v-html="sheetFront" />
            <figcaption class="text-xs text-muted">Página 1 · anversos</figcaption>
          </figure>
          <figure v-if="sheetBack" class="flex min-w-0 flex-col items-center gap-1.5">
            <!-- eslint-disable-next-line vue/no-v-html -- SVG built by the card engine -->
            <div class="card-svg shadow-md" :style="sheetStyle" v-html="sheetBack" />
            <figcaption class="text-xs text-muted">Página 2 · reversos en espejo</figcaption>
          </figure>
        </div>
        <p v-if="sheetBack" class="text-xs text-muted">
          Impreso a doble cara volteando por el borde
          {{ options.sheet.flip === 'long' ? 'largo' : 'corto' }}, cada reverso cae detrás de su
          cartón.
        </p>
      </template>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        title="No se puede dibujar el cartón"
        :description="error"
      />
      <UAlert
        v-if="missing.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-type"
        title="Hay caracteres que ninguna fuente puede dibujar"
      >
        <template #description>
          Saldrán en blanco o como un recuadro:
          <span class="glyphs font-medium text-highlighted">{{ missing.join(' ') }}</span>
        </template>
      </UAlert>
      <UAlert
        v-if="failed.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-cloud-off"
        title="No se pudieron cargar algunas fuentes"
        :description="`${failed.map((id) => fontLabel(design, id)).join(', ')}. Su texto se dibuja con Noto Sans.`"
      />
      <UAlert
        v-if="logoMissing"
        color="neutral"
        variant="subtle"
        icon="i-lucide-image-off"
        title="No se pudo cargar el logo del panel"
        description="Se usa el logo por defecto. Comprueba la conexión con el servidor."
      />
    </div>
  </UCard>
</template>

<style scoped>
.card-svg {
  line-height: 0;
}
.card-svg :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.glyphs {
  font-family: 'Montserrat', var(--font-glyphs, ui-sans-serif, system-ui, sans-serif);
}
</style>
