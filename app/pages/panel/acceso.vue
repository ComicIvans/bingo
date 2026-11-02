<script setup lang="ts">
import type { SessionInfo, Settings } from '#shared/types/api'

definePageMeta({ layout: false })
useHead({
  title: 'Acceso al panel',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const route = useRoute()
const fetcher = useRequestFetch()

// Only same-site paths: never `//host`, `/\host` or absolute URLs, and no
// whitespace (browsers drop tabs and newlines, so `/\t/host` means `//host`).
const redirectTo = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && /^\/(?![/\\])\S*$/.test(target) ? target : '/panel'
})

// The login and session calls bypass useAdmin on purpose: a 401 here means
// a wrong key, not an expired session.
const { data: session } = await useAsyncData('panel-login-session', () =>
  fetcher<SessionInfo>('/api/auth/session').catch(() => null)
)
const { data: settings } = await useAsyncData('panel-login-settings', () =>
  fetcher<Settings>('/api/settings').catch(() => null)
)

if (session.value?.authenticated) await navigateTo(redirectTo.value, { replace: true })

const notConfigured = ref(session.value?.configured === false)
const key = ref('')
const showKey = ref(false)
const submitting = ref(false)
const errorMessage = ref<string | null>(null)

const logo = (variant: 'dark' | 'light') =>
  `/api/branding/logo?variant=${variant}&v=${settings.value?.logoVersion ?? 0}`

async function login() {
  if (!key.value.trim() || submitting.value) return
  submitting.value = true
  errorMessage.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { key: key.value } })
    await navigateTo(redirectTo.value, { replace: true })
  } catch (failure) {
    const e = failure as { statusCode?: number; data?: { statusMessage?: string } }
    switch (e.statusCode) {
      case 401:
        errorMessage.value = 'Clave incorrecta.'
        break
      case 429:
        errorMessage.value =
          e.data?.statusMessage ?? 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
        break
      case 503:
        notConfigured.value = true
        break
      default:
        errorMessage.value =
          e.data?.statusMessage ?? 'No se ha podido conectar con el servidor. Inténtalo de nuevo.'
    }
    key.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
    <UCard class="w-full max-w-sm" :ui="{ body: 'space-y-6 sm:p-8' }">
      <div class="flex flex-col items-center gap-4 text-center">
        <UColorModeImage
          :light="logo('light')"
          :dark="logo('dark')"
          alt="Logo"
          class="h-14 w-auto max-w-full object-contain"
        />
        <div>
          <h1 class="font-display text-xl font-bold text-highlighted">Panel de administración</h1>
          <p class="mt-1 text-sm text-muted">
            Introduce la clave para dirigir la partida{{
              settings?.title ? ` de «${settings.title}»` : ''
            }}.
          </p>
        </div>
      </div>

      <UAlert
        v-if="notConfigured"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="El panel no está configurado"
        description="Define la variable de entorno NUXT_ADMIN_KEY en el servidor y reinícialo para poder entrar."
      />

      <form v-else class="space-y-4" @submit.prevent="login">
        <UFormField label="Clave de administración" name="key" :error="errorMessage ?? undefined">
          <UInput
            v-model="key"
            :type="showKey ? 'text' : 'password'"
            autocomplete="current-password"
            autofocus
            required
            size="lg"
            class="w-full"
            icon="i-lucide-key-round"
            :ui="{ trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                :icon="showKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="showKey ? 'Ocultar clave' : 'Mostrar clave'"
                :aria-pressed="showKey"
                @click="showKey = !showKey"
              />
            </template>
          </UInput>
        </UFormField>

        <UButton
          type="submit"
          label="Entrar"
          icon="i-lucide-log-in"
          size="lg"
          block
          :loading="submitting"
          :disabled="!key.trim()"
        />
      </form>

      <div class="text-center">
        <ULink to="/" class="text-sm text-muted hover:text-default">
          Volver a la pantalla pública
        </ULink>
      </div>
    </UCard>
  </main>
</template>
