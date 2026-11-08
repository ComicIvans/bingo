<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { DEFAULT_SETTINGS } from '#shared/types/api'

definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Ajustes' })

const admin = useAdmin()
const confirm = usePanelConfirm()
const toast = useToast()
const { state: live } = useLiveState()

const { data: settings } = await useAsyncData('panel-settings', () => admin.settings())

// ─── General ───────────────────────────────────────────────────────────────

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre del evento.')
    .max(80, 'Como máximo 80 caracteres.'),
  subtitle: z.string().trim().max(120, 'Como máximo 120 caracteres.'),
  publicTheme: z.enum(['dark', 'light']),
  recentCount: z
    .number({ error: 'Escribe un número.' })
    .int('Tiene que ser un número entero.')
    .min(0, 'Como mínimo 0.')
    .max(20, 'Como máximo 20.'),
})
type Schema = z.output<typeof schema>

const source = computed(() => settings.value ?? live.value?.settings ?? DEFAULT_SETTINGS)

const form = reactive<Schema>({
  title: source.value.title,
  subtitle: source.value.subtitle,
  publicTheme: source.value.publicTheme,
  recentCount: source.value.recentCount,
})

const dirty = computed(
  () =>
    form.title !== source.value.title ||
    form.subtitle !== source.value.subtitle ||
    form.publicTheme !== source.value.publicTheme ||
    form.recentCount !== source.value.recentCount
)

const THEME_OPTIONS = [
  { label: 'Oscuro', value: 'dark', description: 'Fondo oscuro, ideal para proyectores.' },
  { label: 'Claro', value: 'light', description: 'Fondo claro, para pantallas con mucha luz.' },
]

async function save(event: FormSubmitEvent<Schema>) {
  const saved = await admin.updateSettings(event.data)
  if (!saved) return
  settings.value = saved
  Object.assign(form, {
    title: saved.title,
    subtitle: saved.subtitle,
    publicTheme: saved.publicTheme,
    recentCount: saved.recentCount,
  })
  toast.add({ title: 'Ajustes guardados', color: 'success', icon: 'i-lucide-check' })
}

function resetForm() {
  Object.assign(form, {
    title: source.value.title,
    subtitle: source.value.subtitle,
    publicTheme: source.value.publicTheme,
    recentCount: source.value.recentCount,
  })
}

// ─── Logo ──────────────────────────────────────────────────────────────────

const LOGO_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}
const LOGO_MAX_BYTES = 2 * 1024 * 1024

// Some systems give no MIME type (often for SVG): fall back to the extension.
// The server checks the actual bytes anyway.
function logoType(file: File): string | null {
  if (file.type) return Object.values(LOGO_TYPES).includes(file.type) ? file.type : null
  return LOGO_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

type LogoVariant = 'dark' | 'light'

interface LogoSlot {
  variant: LogoVariant
  /** Name of the background, for labels ("fondo oscuro"). */
  background: string
  /** Classes of the preview box. */
  boxClass: string
  file: File | null
  error: string | null
  previewUrl: string | null
}

const slots = reactive<LogoSlot[]>([
  {
    variant: 'dark',
    background: 'fondo oscuro',
    boxClass: 'bg-zinc-950',
    file: null,
    error: null,
    previewUrl: null,
  },
  {
    variant: 'light',
    background: 'fondo claro',
    boxClass: 'bg-white',
    file: null,
    error: null,
    previewUrl: null,
  },
])
const otherSlot = (slot: LogoSlot) => slots.find((other) => other.variant !== slot.variant)!

for (const slot of slots) {
  watch(
    () => slot.file,
    (file) => {
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl)
      slot.previewUrl = null
      slot.error = null
      if (!file) return
      const type = logoType(file)
      if (!type) slot.error = 'Formato no admitido. Usa PNG, JPEG, WebP o SVG.'
      else if (file.size > LOGO_MAX_BYTES) slot.error = 'El archivo pesa más de 2 MB.'
      // An SVG only shows in <img> with its MIME type set.
      else slot.previewUrl = URL.createObjectURL(file.type ? file : new Blob([file], { type }))
    }
  )
}

onBeforeUnmount(() => {
  for (const slot of slots) if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl)
})

// A dropped file of another type is discarded by UFileUpload without a word.
function onLogoRejected(files: File[]) {
  toast.add({
    title: 'Formato no admitido',
    description: `«${files[0]?.name ?? 'El archivo'}» no es PNG, JPEG, WebP ni SVG.`,
    color: 'error',
    icon: 'i-lucide-file-x',
  })
}

const logoVersion = computed(
  () => settings.value?.logoVersion ?? live.value?.settings.logoVersion ?? 0
)
function hasCustomLogo(variant: LogoVariant): boolean {
  const current = settings.value ?? live.value?.settings
  return (variant === 'dark' ? current?.hasCustomDarkLogo : current?.hasCustomLogo) ?? false
}

/**
 * What the slot shows: its pending file, else what the server serves for it
 * (its own upload, the other background's upload, or the default logo).
 */
function logoSrc(slot: LogoSlot): string {
  if (slot.previewUrl) return slot.previewUrl
  // A pending file for the other background will also be used here while
  // this one has no upload of its own.
  const other = otherSlot(slot)
  if (!hasCustomLogo(slot.variant) && other.previewUrl) return other.previewUrl
  return `/api/branding/logo?variant=${slot.variant}&v=${logoVersion.value}`
}

function logoStatus(slot: LogoSlot): string {
  if (slot.previewUrl) return 'Vista previa: pulsa «Subir» para usarlo.'
  if (hasCustomLogo(slot.variant)) return 'Logo subido.'
  const other = otherSlot(slot)
  if (other.previewUrl || hasCustomLogo(other.variant)) return `Usa el logo de ${other.background}.`
  return 'Logo por defecto.'
}

const busyVariant = ref<LogoVariant | null>(null)

async function uploadLogo(slot: LogoSlot) {
  const file = slot.file
  if (!file || slot.error) return
  busyVariant.value = slot.variant
  try {
    const saved = await admin.uploadLogo(file, slot.variant)
    if (!saved) return
    settings.value = saved
    slot.file = null
    toast.add({
      title: `Logo para ${slot.background} actualizado`,
      color: 'success',
      icon: 'i-lucide-image',
    })
  } finally {
    busyVariant.value = null
  }
}

async function resetLogo(slot: LogoSlot) {
  const other = otherSlot(slot)
  const fallback = hasCustomLogo(other.variant)
    ? `se usará el de ${other.background}`
    : 'se volverá a usar el de la aplicación'
  const ok = await confirm({
    title: `¿Quitar el logo para ${slot.background}?`,
    description: `Se borrará el logo subido y en ${slot.background} ${fallback}.`,
    confirmLabel: 'Quitar',
    color: 'error',
    icon: 'i-lucide-image-off',
  })
  if (!ok) return
  busyVariant.value = slot.variant
  try {
    const saved = await admin.resetLogo(slot.variant)
    if (!saved) return
    settings.value = saved
    toast.add({
      title: `Logo para ${slot.background} quitado`,
      color: 'success',
      icon: 'i-lucide-image',
    })
  } finally {
    busyVariant.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="panel-ajustes">
    <template #header>
      <UDashboardNavbar title="Ajustes">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Pantalla pública</h2>
            <p class="text-sm text-muted">Lo que ve el público durante la partida.</p>
          </template>

          <UForm :schema="schema" :state="form" class="space-y-5" @submit="save">
            <UFormField
              name="title"
              label="Nombre del evento"
              required
              help="Aparece en la pantalla pública y se propone como título en el generador."
            >
              <UInput v-model="form.title" class="w-full" maxlength="80" />
            </UFormField>
            <UFormField name="subtitle" label="Subtítulo" hint="Opcional">
              <UInput
                v-model="form.subtitle"
                class="w-full"
                maxlength="120"
                placeholder="Fiestas de San Juan 2026"
              />
            </UFormField>
            <UFormField name="publicTheme">
              <URadioGroup
                v-model="form.publicTheme"
                legend="Tema"
                :items="THEME_OPTIONS"
                variant="card"
                orientation="horizontal"
                :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2' }"
              />
            </UFormField>
            <UFormField
              name="recentCount"
              label="Bolas anteriores en pantalla"
              help="Cuántas de las últimas bolas se listan junto a la actual (0 para ocultarlas)."
            >
              <UInputNumber v-model="form.recentCount" :min="0" :max="20" class="w-40" />
            </UFormField>

            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                label="Descartar cambios"
                color="neutral"
                variant="ghost"
                :disabled="!dirty"
                @click="resetForm"
              />
              <UButton
                type="submit"
                label="Guardar"
                icon="i-lucide-check"
                :loading="admin.pending.value"
                :disabled="!dirty"
              />
            </div>
          </UForm>
        </UCard>

        <UCard :ui="{ body: 'space-y-5' }">
          <template #header>
            <h2 class="font-semibold text-highlighted">Logo</h2>
            <p class="text-sm text-muted">
              Se muestra en la pantalla pública y en el panel, según su tema. Sube uno para cada
              fondo; si solo subes uno, se usa en los dos. Los cartones usan el de fondo claro. PNG,
              JPEG, WebP o SVG de hasta 2 MB, mejor con fondo transparente.
            </p>
          </template>

          <div class="grid gap-6 sm:grid-cols-2 sm:gap-4">
            <section v-for="slot in slots" :key="slot.variant" class="flex flex-col gap-3">
              <figure class="space-y-1.5">
                <figcaption class="text-sm font-medium text-highlighted">
                  Para {{ slot.background }}
                </figcaption>
                <div
                  class="flex h-36 items-center justify-center rounded-lg p-4 ring-1 ring-default"
                  :class="slot.boxClass"
                >
                  <img
                    :src="logoSrc(slot)"
                    :alt="`Logo sobre ${slot.background}`"
                    class="max-h-full max-w-full object-contain"
                  />
                </div>
                <p class="text-xs" :class="slot.previewUrl ? 'text-info' : 'text-muted'">
                  {{ logoStatus(slot) }}
                </p>
              </figure>

              <UFormField
                :label="`Nuevo logo para ${slot.background}`"
                :error="slot.error ?? undefined"
                :ui="{ label: 'sr-only' }"
              >
                <UFileUpload
                  v-model="slot.file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                  label="Arrastra aquí el logo"
                  description="o pulsa para elegir un archivo"
                  icon="i-lucide-image-up"
                  layout="list"
                  class="w-full"
                  @reject="onLogoRejected"
                />
              </UFormField>

              <div class="mt-auto flex flex-wrap justify-end gap-2">
                <UButton
                  label="Quitar"
                  icon="i-lucide-rotate-ccw"
                  color="error"
                  variant="outline"
                  :disabled="!hasCustomLogo(slot.variant) || admin.pending.value"
                  @click="resetLogo(slot)"
                />
                <UButton
                  label="Subir"
                  icon="i-lucide-upload"
                  :disabled="!slot.file || !!slot.error || admin.pending.value"
                  :loading="busyVariant === slot.variant"
                  @click="uploadLogo(slot)"
                />
              </div>
            </section>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
