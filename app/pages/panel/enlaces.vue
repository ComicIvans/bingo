<script setup lang="ts">
definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Enlaces' })

// Seeded on the server and reused by hydration (so the markup matches), then
// replaced with the address the browser really uses: behind a proxy or on a
// LAN IP it can differ, and the QR codes must match the address bar.
const origin = useState('panel-links-origin', () => useRequestURL({ xForwardedHost: true }).origin)
onMounted(() => (origin.value = window.location.origin))

// Links built from localhost only open on this computer.
const localOnly = computed(() => {
  const host = new URL(origin.value).hostname
  return /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(host) || host.endsWith('.localhost')
})

const links = [
  {
    title: 'Pantalla pública',
    description: 'Para el proyector o la pantalla grande: muestra las bolas y los anuncios.',
    icon: 'i-lucide-monitor',
    path: '/',
    slug: 'pantalla-publica',
  },
  {
    title: 'Tablero para voluntarios',
    description: 'Tablero con todas las bolas para quien ayuda a comprobar en la sala.',
    icon: 'i-lucide-layout-grid',
    path: '/tablero',
    slug: 'tablero',
  },
  {
    title: 'Generador de cartones',
    description: 'Diseña los cartones y descárgalos en PDF para imprimir.',
    icon: 'i-lucide-printer',
    path: '/generador',
    slug: 'generador',
  },
  {
    title: 'Panel',
    description: 'Este panel de control. Pide la clave de administración.',
    icon: 'i-lucide-radio-tower',
    path: '/panel',
    slug: 'panel',
  },
]
</script>

<template>
  <UDashboardPanel id="panel-enlaces">
    <template #header>
      <UDashboardNavbar title="Enlaces">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <p class="text-sm text-muted">
          Comparte estos enlaces o escanea los códigos QR desde el móvil. Si alguien no puede
          abrirlos, comprueba que está en la misma red que el servidor.
        </p>
        <UAlert
          v-if="localOnly"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Estos enlaces solo funcionan en este ordenador"
          description="Has abierto el panel con una dirección local (localhost). Para compartirlos, abre el panel con la dirección IP del ordenador en la red, por ejemplo http://192.168.1.20:3000."
        />
        <div class="grid gap-4 lg:grid-cols-2">
          <PanelLinkCard
            v-for="link in links"
            :key="link.path"
            :title="link.title"
            :description="link.description"
            :icon="link.icon"
            :url="`${origin}${link.path}`"
            :slug="link.slug"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
