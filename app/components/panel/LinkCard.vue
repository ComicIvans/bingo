<script setup lang="ts">
import { renderSVG } from 'uqr'

// One shareable view: absolute URL, copy and open buttons, and a QR code.

const props = defineProps<{
  title: string
  description: string
  icon: string
  url: string
  /** File name (without extension) for the QR download. */
  slug: string
}>()

const toast = useToast()
// legacy: execCommand fallback for plain-http LAN addresses, where the
// async clipboard API does not exist.
const { copy, copied, isSupported } = useClipboard({ legacy: true, copiedDuring: 2000 })

// Always black on white so phones can scan it in dark mode too.
const qrSvg = computed(() =>
  renderSVG(props.url, { ecc: 'M', border: 2, whiteColor: '#ffffff', blackColor: '#000000' })
)
const qrSrc = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg.value)}`)

async function copyUrl() {
  try {
    await copy(props.url)
    toast.add({ title: 'Enlace copiado', description: props.url, icon: 'i-lucide-clipboard-check' })
  } catch {
    toast.add({
      title: 'No se ha podido copiar',
      description: 'Selecciona el enlace y cópialo a mano.',
      color: 'error',
      icon: 'i-lucide-clipboard-x',
    })
  }
}

function downloadQr() {
  downloadPanelFile(`qr-${props.slug}.svg`, qrSvg.value, 'image/svg+xml')
}
</script>

<template>
  <UCard :ui="{ root: 'flex flex-col', body: 'flex flex-1 flex-col gap-4 sm:flex-row' }">
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex items-start gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <UIcon :name="icon" class="size-5 text-primary" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <h2 class="font-semibold text-highlighted">{{ title }}</h2>
          <p class="text-sm text-muted">{{ description }}</p>
        </div>
      </div>

      <UInput
        :model-value="url"
        readonly
        class="w-full"
        :ui="{ base: 'font-mono text-xs' }"
        :aria-label="`Enlace a ${title}`"
        @focus="($event.target as HTMLInputElement).select()"
      />

      <div class="mt-auto flex flex-wrap gap-2">
        <UButton
          :label="copied ? 'Copiado' : 'Copiar'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :color="copied ? 'success' : 'primary'"
          variant="soft"
          :disabled="!isSupported"
          @click="copyUrl"
        />
        <UButton
          :to="url"
          target="_blank"
          external
          label="Abrir"
          icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
          :aria-label="`Abrir ${title} en una pestaña nueva`"
        />
        <UButton
          label="QR"
          icon="i-lucide-download"
          color="neutral"
          variant="ghost"
          :aria-label="`Descargar el código QR de ${title}`"
          @click="downloadQr"
        />
      </div>
    </div>

    <div class="flex shrink-0 justify-center">
      <img
        :src="qrSrc"
        :alt="`Código QR de ${title}`"
        width="144"
        height="144"
        class="size-36 rounded-md bg-white p-1 ring-1 ring-default"
      />
    </div>
  </UCard>
</template>
