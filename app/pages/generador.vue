<script setup lang="ts">
// Public card generator. Client-only (routeRules): cards and PDF are built in
// the browser; the server is only asked for sets, settings and to register
// batches.

import { createGenerator, provideGenerator } from '~/composables/generator/useGenerator'

useSeoMeta({
  title: 'Generador de cartones',
  description: 'Diseña cartones de bingo de números, elementos o símbolos y descárgalos en PDF.',
})

const generator = createGenerator()
provideGenerator(generator)
const { ready } = generator
const toast = useToast()
const failed = ref(false)

onMounted(async () => {
  try {
    await generator.init()
  } catch {
    failed.value = true
    toast.add({
      title: 'No se pudo iniciar el generador',
      description: 'Recarga la página para intentarlo de nuevo.',
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
})

// The download panel sits under the preview on wide screens and at the end
// of the settings on phones; it is rendered in one place only.
const isDesktop = useMediaQuery('(min-width: 1024px)')
</script>

<template>
  <div class="min-h-dvh bg-default">
    <header class="sticky top-0 z-20 border-b border-default bg-default/85 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon name="i-lucide-ticket" class="size-6 shrink-0 text-primary" />
          <h1 class="truncate font-display text-lg font-bold text-highlighted sm:text-xl">
            Generador de cartones
          </h1>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <GeneratorDesignMenu v-if="ready" />
          <UColorModeButton />
        </div>
      </UContainer>
    </header>

    <UContainer class="py-4 sm:py-6">
      <p class="mb-4 max-w-3xl text-sm text-muted">
        Elige el conjunto y el formato, personaliza el diseño y descarga los cartones en PDF, uno
        por página o montados en folios con su reverso para imprimir a doble cara. Todo se genera en
        tu navegador y el diseño se guarda en él.
      </p>

      <UAlert
        v-if="failed"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        title="No se pudo iniciar el generador"
        description="Recarga la página para intentarlo de nuevo."
      />

      <div
        v-else-if="!ready"
        class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6"
        aria-busy="true"
        aria-label="Cargando el generador"
      >
        <div class="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
          <USkeleton class="h-10 w-1/2" />
          <USkeleton class="aspect-[2/1] w-full" />
        </div>
        <div class="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
          <USkeleton v-for="n in 6" :key="n" class="h-12 w-full" />
        </div>
      </div>

      <div
        v-else
        class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6"
      >
        <div
          class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-1"
        >
          <GeneratorPreviewPanel />
          <GeneratorExportPanel v-if="isDesktop" />
        </div>
        <div class="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <GeneratorConfigPanel />
          <GeneratorExportPanel v-if="!isDesktop" />
        </div>
      </div>
    </UContainer>
  </div>
</template>
