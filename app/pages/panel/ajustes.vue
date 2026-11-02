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

const logoFile = ref<File | null>(null)
const logoError = ref<string | null>(null)
const previewUrl = ref<string | null>(null)

watch(logoFile, (file) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  logoError.value = null
  if (!file) return
  const type = logoType(file)
  if (!type) logoError.value = 'Formato no admitido. Usa PNG, JPEG, WebP o SVG.'
  else if (file.size > LOGO_MAX_BYTES) logoError.value = 'El archivo pesa más de 2 MB.'
  // An SVG only shows in <img> with its MIME type set.
  else previewUrl.value = URL.createObjectURL(file.type ? file : new Blob([file], { type }))
})

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
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
const hasCustomLogo = computed(
  () => settings.value?.hasCustomLogo ?? live.value?.settings.hasCustomLogo ?? false
)
const logoSrc = (variant: 'dark' | 'light') =>
  previewUrl.value ?? `/api/branding/logo?variant=${variant}&v=${logoVersion.value}`

async function uploadLogo() {
  const file = logoFile.value
  if (!file || logoError.value) return
  const saved = await admin.uploadLogo(file)
  if (!saved) return
  settings.value = saved
  logoFile.value = null
  toast.add({ title: 'Logo actualizado', color: 'success', icon: 'i-lucide-image' })
}

async function resetLogo() {
  const ok = await confirm({
    title: '¿Restaurar el logo por defecto?',
    description: 'Se borrará el logo subido y se volverá a usar el de la aplicación.',
    confirmLabel: 'Restaurar',
    color: 'error',
    icon: 'i-lucide-image-off',
  })
  if (!ok) return
  const saved = await admin.resetLogo()
  if (!saved) return
  settings.value = saved
  toast.add({ title: 'Logo por defecto restaurado', color: 'success', icon: 'i-lucide-image' })
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
              Se muestra en la pantalla pública, en el panel y como logo por defecto de los
              cartones. PNG, JPEG, WebP o SVG de hasta 2 MB; mejor con fondo transparente.
            </p>
          </template>

          <div class="grid gap-3 sm:grid-cols-2">
            <figure class="space-y-1.5">
              <div
                class="flex h-36 items-center justify-center rounded-lg bg-zinc-950 p-4 ring-1 ring-default"
              >
                <img
                  :src="logoSrc('dark')"
                  alt="Vista previa del logo sobre fondo oscuro"
                  class="max-h-full max-w-full object-contain"
                />
              </div>
              <figcaption class="text-xs text-muted">Sobre fondo oscuro</figcaption>
            </figure>
            <figure class="space-y-1.5">
              <div
                class="flex h-36 items-center justify-center rounded-lg bg-white p-4 ring-1 ring-default"
              >
                <img
                  :src="logoSrc('light')"
                  alt="Vista previa del logo sobre fondo claro"
                  class="max-h-full max-w-full object-contain"
                />
              </div>
              <figcaption class="text-xs text-muted">Sobre fondo claro</figcaption>
            </figure>
          </div>

          <UAlert
            v-if="previewUrl"
            color="info"
            variant="subtle"
            icon="i-lucide-eye"
            title="Vista previa"
            description="Así se verá el logo nuevo. Pulsa «Subir logo» para usarlo."
          />

          <UFormField label="Nuevo logo" :error="logoError ?? undefined">
            <UFileUpload
              v-model="logoFile"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
              label="Arrastra aquí el logo"
              description="o pulsa para elegir un archivo"
              icon="i-lucide-image-up"
              layout="list"
              class="w-full"
              @reject="onLogoRejected"
            />
          </UFormField>

          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              label="Restaurar logo por defecto"
              icon="i-lucide-rotate-ccw"
              color="error"
              variant="outline"
              :disabled="!hasCustomLogo || admin.pending.value"
              @click="resetLogo"
            />
            <UButton
              label="Subir logo"
              icon="i-lucide-upload"
              :disabled="!logoFile || !!logoError"
              :loading="admin.pending.value"
              @click="uploadLogo"
            />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
