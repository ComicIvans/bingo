<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const admin = useAdmin()
const { state } = useLiveState()
const colorMode = useColorMode()

useHead({
  titleTemplate: (title) => (title ? `${title} · Panel de bingo` : 'Panel de bingo'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const sidebarOpen = ref(false)

const mainItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Partida', icon: 'i-lucide-radio-tower', to: '/panel', exact: true },
  { label: 'Comprobar cartón', icon: 'i-lucide-ticket-check', to: '/panel/comprobar' },
  {
    label: 'Historial',
    icon: 'i-lucide-history',
    to: '/panel/historial',
    active: route.path.startsWith('/panel/historial'),
  },
  { label: 'Conjuntos', icon: 'i-lucide-library', to: '/panel/conjuntos' },
  { label: 'Lotes', icon: 'i-lucide-layers', to: '/panel/lotes' },
  { label: 'Ajustes', icon: 'i-lucide-settings', to: '/panel/ajustes' },
  { label: 'Enlaces', icon: 'i-lucide-link', to: '/panel/enlaces' },
])

const externalItems: NavigationMenuItem[] = [
  { label: 'Pantalla pública', icon: 'i-lucide-monitor', to: '/', target: '_blank' },
  { label: 'Generador de cartones', icon: 'i-lucide-printer', to: '/generador', target: '_blank' },
]

const logoVersion = computed(() => state.value?.settings.logoVersion ?? 0)
const logo = (variant: 'dark' | 'light') =>
  `/api/branding/logo?variant=${variant}&v=${logoVersion.value}`

const isDark = computed(() => colorMode.value === 'dark')
function toggleColorMode() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

async function logout() {
  if (await admin.logout()) await navigateTo('/panel/acceso')
}
</script>

<template>
  <UDashboardGroup storage-key="panel-dashboard">
    <UDashboardSidebar
      id="panel-sidebar"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      :min-size="14"
      :default-size="17"
      :max-size="24"
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/panel"
          class="flex h-full w-full items-center"
          :class="collapsed ? 'justify-center' : 'px-1'"
          aria-label="Ir a la partida"
        >
          <UColorModeImage
            :light="logo('light')"
            :dark="logo('dark')"
            :alt="state?.settings.title ? `Logo de ${state.settings.title}` : 'Logo'"
            class="w-auto max-w-full object-contain object-left"
            :class="collapsed ? 'h-6' : 'h-9'"
          />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="mainItems"
          orientation="vertical"
          tooltip
          aria-label="Secciones del panel"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="externalItems"
          orientation="vertical"
          tooltip
          class="mt-auto"
          aria-label="Otras vistas"
        />
      </template>

      <template #footer="{ collapsed }">
        <div
          class="flex w-full gap-1"
          :class="collapsed ? 'flex-col items-center' : 'items-center'"
        >
          <UButton
            icon="i-lucide-log-out"
            :label="collapsed ? undefined : 'Cerrar sesión'"
            color="neutral"
            variant="ghost"
            :square="collapsed"
            :block="!collapsed"
            class="justify-start"
            :class="collapsed ? '' : 'flex-1'"
            aria-label="Cerrar sesión"
            :loading="admin.pending.value"
            @click="logout"
          />
          <ClientOnly>
            <UTooltip :text="isDark ? 'Modo claro' : 'Modo oscuro'">
              <UButton
                :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
                color="neutral"
                variant="ghost"
                square
                :aria-label="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
                @click="toggleColorMode"
              />
            </UTooltip>
            <template #fallback>
              <div class="size-8" />
            </template>
          </ClientOnly>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
