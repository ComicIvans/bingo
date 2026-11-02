<script setup lang="ts">
import { DEFAULT_SETTINGS } from '#shared/types/api'
import type { BingoItem } from '#shared/types/bingo'

// Board for the volunteers who check cards on phones and tablets: every item
// of the set, with the drawn ones filled in. It follows the site colour mode.

const { state, connected, ready } = useLiveState()
await ready

const settings = computed(() => state.value?.settings ?? DEFAULT_SETTINGS)
const game = computed(() => state.value?.game ?? null)
const draws = computed(() => game.value?.draws ?? [])
const total = computed(() => game.value?.total ?? game.value?.items.length ?? 0)
const last = computed(() => draws.value.at(-1) ?? null)
const announcement = computed(() => (game.value ? (state.value?.announcement ?? null) : null))

// Short version of the public announcement, so volunteers know which card
// is being checked.
const notice = computed(() => {
  const a = announcement.value
  if (!a) return null
  const message = a.kind === 'message'
  const note = a.text?.trim() ?? ''
  let title = note || 'Aviso'
  if (a.kind === 'bingo') title = '¡Bingo!'
  else if (a.kind === 'line') title = '¡Línea!'
  const details = [a.cardCode ? `Cartón ${a.cardCode}` : '', message ? '' : note]
  return {
    title,
    description: details.filter(Boolean).join(' · ') || undefined,
    color: message ? ('info' as const) : ('primary' as const),
    icon: message ? 'i-lucide-megaphone' : 'i-lucide-party-popper',
  }
})

const progress = computed(() =>
  total.value ? Math.min(100, (draws.value.length / total.value) * 100) : 0
)

const SAFE_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const color = computed(() => {
  const value = game.value?.color?.trim() ?? ''
  return SAFE_COLOR.test(value) ? value : '#f43f5e'
})

/** Dark or white ink, whichever contrasts more with a hex colour. */
function inkFor(hex: string): string {
  let digits = hex.replace('#', '')
  if (digits.length <= 4) digits = [...digits.slice(0, 3)].map((d) => d + d).join('')
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  if (channels.some(Number.isNaN)) return '#18181b'
  const [r = 0, g = 0, b = 0] = channels
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#18181b' : '#ffffff'
}

const ink = computed(() => inkFor(color.value))

// ─── View options (remembered on this device) ─────────────────────────────

const namesPref = useLocalStorage<'auto' | 'on' | 'off'>('bingo:tablero:names', 'auto', {
  initOnMounted: true,
})
const orderPref = useLocalStorage<'index' | 'draw'>('bingo:tablero:order', 'index', {
  initOnMounted: true,
})

// Names are on by default for sets whose names are what gets announced.
const showNames = computed({
  get: () =>
    namesPref.value === 'on' ||
    (namesPref.value !== 'off' && (game.value?.publicDisplay ?? 'label') !== 'label'),
  set: (value: boolean) => (namesPref.value = value ? 'on' : 'off'),
})

const order = computed(() => (orderPref.value === 'draw' ? 'draw' : 'index'))

const orderOptions = [
  { value: 'index', label: 'Por posición', icon: 'i-lucide-grid-3x3' },
  { value: 'draw', label: 'Por salida', icon: 'i-lucide-history' },
] as const

const query = ref('')

// The button's own label comes from the Nuxt UI locale (English by default).
// It is gated on the mount like the button's icon, so SSR and hydration agree.
const colorMode = useColorMode()
const mounted = useMounted()
const colorModeLabel = computed(() =>
  mounted.value && colorMode.value === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
)

// ─── Cells ────────────────────────────────────────────────────────────────

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

interface Cell {
  item: BingoItem
  /** Position in the draw (1 = first), or 0 when not drawn yet. */
  drawn: number
  search: string
}

const cells = computed<Cell[]>(() => {
  const position = new Map(draws.value.map((draw, i) => [draw.index, i + 1]))
  const list = [...(game.value?.items ?? [])]
    .sort((a, b) => a.index - b.index)
    .map((item) => ({
      item,
      drawn: position.get(item.index) ?? 0,
      search: `${normalize(item.label)}\n${normalize(item.name)}`,
    }))
  if (order.value === 'index') return list
  // Most recent first, then the ones still to come in board order.
  return [
    ...list.filter((c) => c.drawn).sort((a, b) => b.drawn - a.drawn),
    ...list.filter((c) => !c.drawn),
  ]
})

const visibleCells = computed(() => {
  const q = normalize(query.value)
  return q ? cells.value.filter((c) => c.search.includes(q)) : cells.value
})

// Spoken through an always-present status region: one inserted with v-if is
// often not announced.
const resultsText = computed(() => {
  if (!query.value.trim()) return ''
  const n = visibleCells.value.length
  if (!n) return 'Sin resultados'
  return n === 1 ? '1 resultado' : `${n} resultados`
})

function labelSize(label: string) {
  const length = [...label].length
  if (length <= 2) return 'text-2xl sm:text-3xl'
  if (length <= 4) return 'text-xl sm:text-2xl'
  return 'text-sm sm:text-base break-all'
}

// ─── Head ─────────────────────────────────────────────────────────────────

function withEventTitle(base: string, title: string) {
  const event = title.trim()
  return event && event.toLowerCase() !== 'bingo' ? `${base} · ${event}` : base
}

useSeoMeta({ title: () => withEventTitle('Tablero', settings.value.title) })
</script>

<template>
  <div class="min-h-dvh bg-default" :style="{ '--set': color, '--set-ink': ink }">
    <header
      class="sticky top-0 z-20 border-b border-default bg-default/90 backdrop-blur supports-[backdrop-filter]:bg-default/75"
    >
      <div class="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold tracking-wider text-muted uppercase">
              Tablero<template v-if="game"> · {{ game.setName }}</template>
            </p>
            <h1 class="truncate font-display text-lg font-bold text-highlighted sm:text-xl">
              {{ game?.name ?? (settings.title.trim() || 'Bingo') }}
            </h1>
          </div>
          <UBadge
            v-if="game?.status === 'finished'"
            label="Finalizada"
            color="neutral"
            variant="soft"
            icon="i-lucide-flag"
          />
          <UColorModeButton :aria-label="colorModeLabel" />
        </div>

        <div v-if="game" class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p class="flex items-baseline gap-1.5 whitespace-nowrap">
            <span class="text-2xl font-bold text-highlighted tabular-nums">
              {{ draws.length }}
            </span>
            <span class="text-sm text-muted">de {{ total }}</span>
          </p>
          <div
            class="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-accented"
            role="progressbar"
            aria-label="Bolas sacadas"
            aria-valuemin="0"
            :aria-valuemax="total"
            :aria-valuenow="draws.length"
          >
            <div
              class="h-full rounded-full bg-(--set) transition-[width] duration-500 motion-reduce:transition-none"
              :style="{ width: `${progress}%` }"
            />
          </div>
          <p
            class="flex min-w-0 basis-full items-center gap-2 text-sm sm:basis-auto"
            aria-live="polite"
          >
            <span class="text-muted">Último:</span>
            <template v-if="last">
              <span class="glyphs rounded-md bg-(--set) px-2 py-0.5 font-bold text-(--set-ink)">
                {{ last.label }}
              </span>
              <span v-if="last.name !== last.label" class="truncate text-default">
                ({{ last.name }})
              </span>
            </template>
            <span v-else class="text-dimmed">todavía no ha salido ninguna</span>
          </p>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-4 sm:px-6">
      <template v-if="game">
        <UAlert
          v-if="notice"
          class="mb-4"
          variant="subtle"
          :color="notice.color"
          :icon="notice.icon"
          :title="notice.title"
          :description="notice.description"
        />

        <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <UInput
            v-model="query"
            type="text"
            enterkeyhint="search"
            icon="i-lucide-search"
            placeholder="Buscar por etiqueta o nombre"
            aria-label="Buscar por etiqueta o nombre"
            autocomplete="off"
            size="lg"
            class="w-full md:max-w-sm"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="query" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                aria-label="Borrar la búsqueda"
                @click="query = ''"
              />
            </template>
          </UInput>
          <div class="flex flex-wrap items-center justify-between gap-3 md:ml-auto">
            <USwitch v-model="showNames" label="Mostrar nombres" />
            <UFieldGroup role="group" aria-label="Orden del tablero" size="sm">
              <UButton
                v-for="option in orderOptions"
                :key="option.value"
                :label="option.label"
                :icon="option.icon"
                color="neutral"
                :variant="order === option.value ? 'solid' : 'outline'"
                :aria-pressed="order === option.value"
                @click="orderPref = option.value"
              />
            </UFieldGroup>
          </div>
        </div>

        <p
          role="status"
          class="text-sm text-muted"
          :class="query.trim() && visibleCells.length ? 'mb-3' : 'sr-only'"
        >
          {{ resultsText }}
        </p>

        <ul
          v-if="visibleCells.length"
          aria-label="Bolas del conjunto"
          class="grid gap-2 sm:gap-3"
          :class="
            showNames
              ? 'grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]'
              : 'grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))]'
          "
        >
          <li
            v-for="cell in visibleCells"
            :key="cell.item.index"
            class="relative flex flex-col items-center justify-center gap-1 rounded-xl p-1.5 text-center"
            :class="[
              showNames ? 'min-h-24' : 'aspect-square',
              cell.drawn
                ? 'bg-(--set) text-(--set-ink) shadow-sm'
                : 'bg-elevated text-muted ring-1 ring-default ring-inset',
              { 'cell--last': last && cell.item.index === last.index },
            ]"
          >
            <span
              v-if="order === 'draw' && cell.drawn"
              class="absolute top-1 left-1.5 text-[0.65rem] font-semibold tabular-nums opacity-70"
              aria-hidden="true"
            >
              #{{ cell.drawn }}
            </span>
            <span
              class="glyphs leading-none font-bold"
              :class="[labelSize(cell.item.label), cell.drawn ? '' : 'text-toned']"
            >
              {{ cell.item.label }}
            </span>
            <span
              v-if="showNames"
              class="line-clamp-2 text-xs leading-tight font-medium break-words"
              :class="cell.drawn ? 'opacity-90' : ''"
            >
              {{ cell.item.name }}
            </span>
            <span class="sr-only">
              <template v-if="!showNames">, {{ cell.item.name }}</template>
              <template v-if="cell.drawn">
                : ha salido en {{ cell.drawn }}.º lugar{{
                  last && cell.item.index === last.index ? ', es la última' : ''
                }}
              </template>
              <template v-else>: pendiente</template>
            </span>
          </li>
        </ul>

        <UEmpty
          v-else
          icon="i-lucide-search-x"
          title="Sin resultados"
          :description="`Nada coincide con «${query.trim()}».`"
          variant="naked"
          :actions="[
            {
              label: 'Borrar la búsqueda',
              color: 'neutral',
              variant: 'subtle',
              icon: 'i-lucide-x',
              onClick: () => (query = ''),
            },
          ]"
        />
      </template>

      <UEmpty
        v-else
        class="mt-10"
        icon="i-lucide-calendar-clock"
        title="Todavía no hay ninguna partida"
        description="El tablero aparecerá aquí en cuanto empiece la partida. No hace falta recargar la página."
        variant="naked"
        size="lg"
      />
    </main>

    <LiveConnectionStatus
      :connected="connected"
      class="fixed bottom-4 left-1/2 z-30 -translate-x-1/2"
    />
  </div>
</template>

<style scoped>
.glyphs {
  font-family: 'Lexend Deca', var(--font-glyphs);
}

/* The last draw stands out with a ring in the set colour and a soft pulse. */
.cell--last {
  z-index: 1;
  box-shadow:
    0 0 0 3px var(--ui-bg),
    0 0 0 6px var(--set);
  animation: last-pulse 2s ease-in-out infinite;
}

@keyframes last-pulse {
  50% {
    transform: scale(1.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cell--last {
    animation: none;
  }
}
</style>
