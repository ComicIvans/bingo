<script setup lang="ts">
// Back of the card.

import type { BackCodePosition } from '#shared/cards/design'
import { useGenerator } from '~/composables/generator/useGenerator'

const { design } = useGenerator()

const FITS = [
  { label: 'Cubrir todo el reverso (recorta lo que sobra)', value: 'cover' },
  { label: 'Entera, dentro del margen', value: 'contain' },
]

const CODE_POSITIONS: { label: string; value: BackCodePosition }[] = [
  { label: 'Arriba a la izquierda', value: 'top-left' },
  { label: 'Arriba en el centro', value: 'top-center' },
  { label: 'Arriba a la derecha', value: 'top-right' },
  { label: 'Debajo del texto', value: 'below' },
  { label: 'Abajo a la izquierda', value: 'bottom-left' },
  { label: 'Abajo en el centro', value: 'bottom-center' },
  { label: 'Abajo a la derecha', value: 'bottom-right' },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <USwitch
      v-model="design.back.enabled"
      label="Imprimir reverso"
      description="Cada folio de anversos va seguido de otro con los reversos, listo para imprimir a doble cara."
    />
    <template v-if="design.back.enabled">
      <GeneratorColorField v-model="design.back.background" label="Fondo" />
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Imagen de fondo" description="Va detrás del logo y los textos.">
          <GeneratorImageSelect v-model="design.back.imageId" allow-none />
        </UFormField>
        <UFormField v-if="design.back.imageId" label="Encaje de la imagen">
          <USelect v-model="design.back.imageFit" :items="FITS" value-key="value" class="w-full" />
        </UFormField>
      </div>

      <USeparator label="Logo" />
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Logo" description="Centrado encima del título; aparte del fondo.">
          <GeneratorImageSelect v-model="design.back.logoId" allow-none />
        </UFormField>
        <GeneratorNumberField
          v-if="design.back.logoId"
          v-model="design.back.logoHeight"
          label="Alto del logo"
          percent
          :min="0"
          :max="90"
          description="Respecto al alto del cartón."
        />
      </div>

      <USeparator label="Título" />
      <UFormField label="Título">
        <UInput v-model="design.back.title" maxlength="200" class="w-full" />
      </UFormField>
      <GeneratorTextStyleFields
        v-if="design.back.title.trim()"
        v-model="design.back.titleStyle"
        subject="del título"
      />

      <USeparator label="Texto" />
      <UFormField
        label="Texto"
        description="Respeta los saltos de línea; las líneas largas se parten solas."
      >
        <UTextarea v-model="design.back.text" :rows="3" autoresize :maxrows="8" class="w-full" />
      </UFormField>
      <GeneratorTextStyleFields
        v-if="design.back.text.trim()"
        v-model="design.back.textStyle"
        subject="del texto"
      />

      <USeparator label="Código" />
      <USwitch v-model="design.back.showCode" label="Mostrar el código del cartón" />
      <UFormField v-if="design.back.showCode" label="Posición del código">
        <USelect
          v-model="design.back.codePosition"
          :items="CODE_POSITIONS"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <GeneratorTextStyleFields
        v-if="design.back.showCode"
        v-model="design.back.codeStyle"
        subject="del código"
      />
    </template>
  </div>
</template>
