<script setup lang="ts">
// Configuration sections. Accordion sections unmount when closed; their state
// lives in the generator context.

const sections = [
  { label: 'Conjunto y formato', icon: 'i-lucide-grid-3x3', value: 'set', slot: 'set' as const },
  { label: 'Lote', icon: 'i-lucide-layers', value: 'batch', slot: 'batch' as const },
  { label: 'Cartón', icon: 'i-lucide-rectangle-horizontal', value: 'card', slot: 'card' as const },
  { label: 'Cabecera', icon: 'i-lucide-panel-top', value: 'header', slot: 'header' as const },
  { label: 'Cuadrícula', icon: 'i-lucide-table', value: 'grid', slot: 'grid' as const },
  { label: 'Pie', icon: 'i-lucide-panel-bottom', value: 'footer', slot: 'footer' as const },
  { label: 'Reverso', icon: 'i-lucide-flip-horizontal-2', value: 'back', slot: 'back' as const },
  {
    label: 'Imágenes y fuentes',
    icon: 'i-lucide-images',
    value: 'assets',
    slot: 'assets' as const,
  },
  { label: 'Impresión', icon: 'i-lucide-printer', value: 'print', slot: 'print' as const },
]

const open = ref<string[]>(['set'])
</script>

<template>
  <UCard :ui="{ body: 'px-3 py-0 sm:px-4 sm:py-0' }">
    <UAccordion
      v-model="open"
      type="multiple"
      :items="sections"
      :ui="{ trigger: 'text-base py-4', body: 'pb-5 pt-1' }"
    >
      <template #set-body><GeneratorSetSection /></template>
      <template #batch-body><GeneratorBatchSection /></template>
      <template #card-body><GeneratorCardSection /></template>
      <template #header-body><GeneratorBandFields band="header" /></template>
      <template #grid-body><GeneratorGridSection /></template>
      <template #footer-body><GeneratorBandFields band="footer" /></template>
      <template #back-body><GeneratorBackSection /></template>
      <template #assets-body><GeneratorAssetsSection /></template>
      <template #print-body><GeneratorPrintSection /></template>
    </UAccordion>
  </UCard>
</template>
