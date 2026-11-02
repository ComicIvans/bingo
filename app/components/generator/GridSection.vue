<script setup lang="ts">
// The grid of items: text, cell colours, free cell and lines.

import { useGenerator } from '~/composables/generator/useGenerator'

const { design, spec, activeSet, applySetColor } = useGenerator()
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField label="Fuente de los elementos">
      <GeneratorFontSelect v-model="design.grid.font" aria-label="Fuente de los elementos" />
    </UFormField>
    <div class="grid grid-cols-2 gap-3">
      <GeneratorNumberField
        v-model="design.grid.maxFontSize"
        label="Tamaño máximo"
        unit="pt"
        :min="4"
        :max="200"
        :step="0.5"
      />
      <GeneratorNumberField
        v-model="design.grid.fill"
        label="Relleno de la casilla"
        percent
        :min="30"
        :max="95"
      />
    </div>
    <p class="-mt-2 text-xs text-muted">
      Todos los elementos usan el mismo tamaño: el mayor con el que el más ancho cabe en su casilla,
      sin pasar del máximo.
    </p>
    <div class="grid gap-3 sm:grid-cols-2">
      <GeneratorColorField v-model="design.grid.textColor" label="Color del texto" />
      <GeneratorColorField v-model="design.grid.filledColor" label="Casillas con elemento" />
      <GeneratorColorField v-model="design.grid.emptyColor" label="Casillas vacías" />
      <GeneratorColorField v-model="design.grid.lineColor" label="Color de las líneas" />
    </div>
    <UButton
      v-if="activeSet"
      icon="i-lucide-paint-bucket"
      label="Usar el color del conjunto"
      color="neutral"
      variant="outline"
      size="sm"
      class="self-start"
      @click="applySetColor"
    >
      <template #trailing>
        <span
          class="size-3.5 rounded-full border border-accented"
          :style="{ backgroundColor: activeSet.color }"
        />
      </template>
    </UButton>
    <div class="grid grid-cols-2 gap-3">
      <GeneratorNumberField
        v-model="design.grid.lineWidth"
        label="Líneas interiores"
        unit="mm"
        :min="0"
        :max="5"
        :step="0.05"
      />
      <GeneratorNumberField
        v-model="design.grid.outerLineWidth"
        label="Marco"
        unit="mm"
        :min="0"
        :max="5"
        :step="0.05"
      />
    </div>
    <USwitch
      v-model="design.grid.squareCells"
      label="Casillas cuadradas"
      description="La cuadrícula se encoge y se centra para que las casillas sean cuadradas."
    />

    <template v-if="spec.freeCenter">
      <USeparator label="Casilla libre" />
      <div class="grid gap-3 sm:grid-cols-2">
        <GeneratorColorField v-model="design.grid.freeColor" label="Fondo de la casilla libre" />
        <GeneratorColorField v-model="design.grid.freeTextColor" label="Color del texto libre" />
      </div>
      <UFormField label="Texto de la casilla libre">
        <UInput v-model="design.grid.freeText" maxlength="60" class="w-full" />
      </UFormField>
      <UFormField
        label="Imagen de la casilla libre"
        description="Si eliges una imagen, se muestra en lugar del texto."
      >
        <GeneratorImageSelect v-model="design.grid.freeImageId" allow-none />
      </UFormField>
    </template>
  </div>
</template>
