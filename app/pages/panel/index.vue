<script setup lang="ts">
import type { AnnouncementKind } from '#shared/types/api'
import type { BingoItem, PublicDisplay } from '#shared/types/bingo'

definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Partida' })

const admin = useAdmin()
const confirm = usePanelConfirm()
const toast = useToast()
const { state, connected, ready } = useLiveState()
await ready

const game = computed(() => state.value?.game ?? null)
const running = computed(() => game.value?.status === 'running')
const announcement = computed(() => state.value?.announcement ?? null)
const lastDraw = computed(() => game.value?.draws.at(-1) ?? null)
const drawCount = computed(() => game.value?.draws.length ?? 0)
const allDrawn = computed(() => !!game.value && drawCount.value >= game.value.total)

const ANNOUNCEMENT_TITLES: Record<AnnouncementKind, string> = {
  line: '¡Línea!',
  bingo: '¡Bingo!',
  message: 'Mensaje',
}

function describe(item: Pick<BingoItem, 'label' | 'name'>) {
  return item.name && item.name !== item.label ? `${item.label} · ${item.name}` : item.label
}

// ─── Actions ───────────────────────────────────────────────────────────────

async function drawNext() {
  if (!running.value || allDrawn.value || admin.pending.value) return
  await admin.draw()
}

async function mark(item: BingoItem) {
  if (admin.pending.value) return
  const ok = await confirm({
    title: `¿Marcar ${item.label} como salido?`,
    description: `«${describe(item)}» pasará a ser la última bola. Úsalo cuando las bolas salen de un bombo físico.`,
    confirmLabel: 'Marcar como salido',
    icon: 'i-lucide-circle-check',
  })
  if (ok) await admin.draw(item.index)
}

let undoAsking = false
async function undo() {
  const last = lastDraw.value
  if (!last || admin.pending.value || undoAsking) return
  undoAsking = true
  try {
    const ok = await confirm({
      title: '¿Deshacer la última bola?',
      description: `Se quitará «${describe(last)}» de la secuencia y volverá al bombo.`,
      confirmLabel: 'Deshacer',
      color: 'warning',
      icon: 'i-lucide-undo-2',
    })
    if (ok) await admin.undo()
  } finally {
    undoAsking = false
  }
}

async function finish() {
  const ok = await confirm({
    title: '¿Terminar la partida?',
    description:
      'La partida se guardará en el historial y ya no se podrán sacar más bolas. Esta acción no se puede deshacer.',
    confirmLabel: 'Terminar partida',
    color: 'error',
    icon: 'i-lucide-flag',
  })
  if (ok && (await admin.finishGame()))
    toast.add({ title: 'Partida terminada', color: 'success', icon: 'i-lucide-flag' })
}

async function announce(kind: Exclude<AnnouncementKind, 'message'>) {
  await admin.announce({ kind })
}

const publicDisplay = computed<PublicDisplay>({
  get: () => game.value?.publicDisplay ?? 'label',
  set: (value) => {
    if (value !== game.value?.publicDisplay) admin.updateGame({ publicDisplay: value })
  },
})

// ─── Batches in play ───────────────────────────────────────────────────────

// Only batches of the game's set can be in play (the server checks it too).
const { data: allBatches } = useLazyAsyncData('game-batches', () => admin.batches(), {
  server: false,
})
const batchItems = computed(() =>
  (allBatches.value ?? [])
    .filter((batch) => batch.setId === game.value?.setId)
    .map((batch) => ({
      value: batch.id,
      label: batch.id,
      description: `${batch.name} · del ${batch.firstNumber} al ${batch.firstNumber + batch.count - 1}`,
    }))
)
const gameBatchIds = computed(() => (game.value?.batches ?? []).map((batch) => batch.id))

// Edited in a draft and saved when the menu closes, so ticking several
// batches is a single change.
const batchDraft = ref<string[]>([])
watch(gameBatchIds, (ids) => (batchDraft.value = [...ids]), { immediate: true })

async function saveBatches(open: boolean) {
  if (open) return
  const next = [...batchDraft.value].sort()
  const current = [...gameBatchIds.value].sort()
  if (next.join() === current.join()) return
  if (!(await admin.updateGame({ batchIds: next }))) batchDraft.value = [...gameBatchIds.value]
}

// ─── Rename ────────────────────────────────────────────────────────────────

const renameOpen = ref(false)
const newName = ref('')
const renameError = computed(() => {
  const name = newName.value.trim()
  if (!name) return 'Escribe un nombre.'
  if (name.length > 80) return 'Como máximo 80 caracteres.'
  return null
})

function openRename() {
  newName.value = game.value?.name ?? ''
  renameOpen.value = true
}

async function rename() {
  if (renameError.value) return
  if (await admin.updateGame({ name: newName.value.trim() })) renameOpen.value = false
}

const messageOpen = ref(false)

// Draw times are formatted in the browser's time zone, so they are left out
// of the server render and hydration and added once mounted.
const mounted = useMounted()

// ─── Keyboard ──────────────────────────────────────────────────────────────

// Controls where Space or Ctrl+Z already mean something.
const FORM_CONTROLS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="switch"], [role="slider"], [role="spinbutton"], [role="textbox"]'

function inFormControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(FORM_CONTROLS)
}

function overlayOpen() {
  return !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')
}

// A board cell reached with the keyboard keeps Space (it opens that cell's
// dialog); one focused by a mouse click does not, so Space still draws.
function boardCellWithKeyboardFocus(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest('[data-panel-board]') &&
    target.matches(':focus-visible')
  )
}

let spaceHandled = false

useEventListener('keydown', (event: KeyboardEvent) => {
  if (!running.value || event.defaultPrevented) return
  if (event.code === 'Space' || event.key === ' ') {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (inFormControl(event.target) || boardCellWithKeyboardFocus(event.target) || overlayOpen())
      return
    // Also swallows the native click of a focused button, so one press is
    // always exactly one draw.
    event.preventDefault()
    spaceHandled = true
    if (!event.repeat) drawNext()
    return
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    if (event.key.toLowerCase() !== 'z') return
    if (inFormControl(event.target) || overlayOpen()) return
    event.preventDefault()
    undo()
  }
})

useEventListener('keyup', (event: KeyboardEvent) => {
  if (spaceHandled && (event.code === 'Space' || event.key === ' ')) {
    event.preventDefault()
    spaceHandled = false
  }
})
</script>

<template>
  <UDashboardPanel id="panel-partida">
    <template #header>
      <UDashboardNavbar title="Partida">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
        <template #right>
          <ClientOnly>
            <UBadge
              :label="connected ? 'En directo' : 'Reconectando…'"
              :color="connected ? 'success' : 'warning'"
              variant="subtle"
              :icon="connected ? 'i-lucide-radio' : 'i-lucide-loader-circle'"
              :ui="{ leadingIcon: connected ? '' : 'animate-spin' }"
            />
          </ClientOnly>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="!state"
        color="error"
        variant="subtle"
        icon="i-lucide-wifi-off"
        title="No se ha podido cargar el estado de la partida"
        description="Comprueba la conexión con el servidor y recarga la página."
      />

      <!-- No game running: start form and last game summary -->
      <div
        v-else-if="!running || !game"
        class="mx-auto grid w-full max-w-5xl gap-6"
        :class="game ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''"
      >
        <PanelStartForm />
        <PanelGameSummary v-if="game" :game="game" />
      </div>

      <!-- Running game -->
      <div v-else class="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:gap-6">
        <section
          class="flex flex-col gap-3 rounded-lg border border-default bg-default p-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Datos de la partida"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate font-display text-xl font-bold text-highlighted">
                {{ game.name }}
              </h2>
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Cambiar el nombre de la partida"
                @click="openRename"
              />
            </div>
            <p class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span class="flex items-center gap-1.5">
                <span
                  class="size-2.5 rounded-full ring-1 ring-default"
                  :style="{ backgroundColor: game.color }"
                  aria-hidden="true"
                />
                {{ game.setName }}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Empezó a las
                <NuxtTime
                  :datetime="game.startedAt"
                  locale="es-ES"
                  hour="2-digit"
                  minute="2-digit"
                />
              </span>
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="Lotes en juego" size="sm" class="min-w-36">
              <USelectMenu
                v-model="batchDraft"
                :items="batchItems"
                value-key="value"
                multiple
                :search-input="false"
                placeholder="Ninguno"
                :disabled="admin.pending.value"
                class="w-full max-w-56"
                aria-label="Lotes de cartones en juego"
                @update:open="saveBatches"
              >
                <template #empty>Este conjunto no tiene lotes.</template>
              </USelectMenu>
            </UFormField>
            <UFormField label="Pantalla pública" size="sm" class="min-w-36">
              <USelect
                v-model="publicDisplay"
                :items="PANEL_DISPLAY_OPTIONS"
                :disabled="admin.pending.value"
                class="w-full"
                aria-label="Qué muestra la pantalla pública"
              />
            </UFormField>
            <UButton
              label="Terminar partida"
              icon="i-lucide-flag"
              color="error"
              variant="outline"
              @click="finish"
            />
          </div>
        </section>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
          <!-- Current item and draw controls -->
          <UCard :ui="{ body: 'flex flex-col items-center gap-5 text-center' }">
            <div class="w-full" aria-live="polite" aria-atomic="true">
              <p class="text-sm font-medium text-muted">
                {{ lastDraw ? 'Última bola' : 'Aún no ha salido ninguna bola' }}
              </p>
              <template v-if="lastDraw">
                <p
                  class="mt-1 font-display text-[clamp(4.5rem,16vw,9rem)] leading-none font-bold break-words text-highlighted"
                >
                  {{ lastDraw.label }}
                </p>
                <p
                  v-if="lastDraw.name && lastDraw.name !== lastDraw.label"
                  class="mt-2 text-xl font-semibold text-default sm:text-2xl"
                >
                  {{ lastDraw.name }}
                </p>
              </template>
              <p v-else class="mt-4 text-sm text-muted">
                Pulsa «Sacar siguiente» o la barra espaciadora para empezar.
              </p>
            </div>

            <div class="w-full max-w-md space-y-1.5">
              <p class="text-sm font-medium">
                <span class="text-highlighted">{{ drawCount }}</span>
                <span class="text-muted"> de {{ game.total }}</span>
              </p>
              <UProgress
                :model-value="drawCount"
                :max="game.total"
                size="sm"
                :aria-label="`${drawCount} de ${game.total} bolas sacadas`"
              />
            </div>

            <div class="flex w-full max-w-md flex-col gap-2">
              <UButton
                size="xl"
                block
                icon="i-lucide-dices"
                :label="allDrawn ? 'Han salido todas las bolas' : 'Sacar siguiente'"
                :loading="admin.pending.value"
                :disabled="allDrawn"
                class="py-4 text-lg"
                @click="drawNext"
              >
                <template #trailing>
                  <UKbd v-if="!allDrawn" value="Espacio" class="ms-auto hidden sm:inline-flex" />
                </template>
              </UButton>
              <UButton
                block
                icon="i-lucide-undo-2"
                label="Deshacer"
                color="neutral"
                variant="outline"
                :disabled="!lastDraw || admin.pending.value"
                @click="undo"
              >
                <template #trailing>
                  <span class="ms-auto hidden gap-0.5 sm:inline-flex">
                    <UKbd value="Ctrl" />
                    <UKbd value="Z" />
                  </span>
                </template>
              </UButton>
            </div>
          </UCard>

          <!-- Announcements -->
          <UCard :ui="{ body: 'space-y-4' }">
            <template #header>
              <h3 class="font-semibold text-highlighted">Anuncios</h3>
            </template>

            <UAlert
              v-if="announcement"
              color="primary"
              variant="subtle"
              icon="i-lucide-megaphone"
              :title="`En pantalla: ${ANNOUNCEMENT_TITLES[announcement.kind]}`"
              :description="
                [announcement.text, announcement.cardCode && `Cartón ${announcement.cardCode}`]
                  .filter(Boolean)
                  .join(' · ') || undefined
              "
            />
            <p v-else class="text-sm text-muted">No hay ningún anuncio en la pantalla pública.</p>

            <div class="grid grid-cols-2 gap-2">
              <UButton
                label="¡Línea!"
                icon="i-lucide-minus"
                size="lg"
                color="success"
                variant="soft"
                block
                :disabled="admin.pending.value"
                @click="announce('line')"
              />
              <UButton
                label="¡Bingo!"
                icon="i-lucide-trophy"
                size="lg"
                color="success"
                block
                :disabled="admin.pending.value"
                @click="announce('bingo')"
              />
              <UButton
                label="Mensaje…"
                icon="i-lucide-message-square-text"
                color="neutral"
                variant="outline"
                block
                @click="messageOpen = true"
              />
              <UButton
                label="Ocultar anuncio"
                icon="i-lucide-eye-off"
                color="neutral"
                variant="outline"
                block
                :disabled="!announcement || admin.pending.value"
                @click="admin.hideAnnouncement()"
              />
            </div>

            <UButton
              to="/panel/comprobar"
              label="Comprobar un cartón"
              icon="i-lucide-ticket-check"
              color="neutral"
              variant="link"
              class="px-0"
            />
          </UCard>
        </div>

        <!-- Board -->
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold text-highlighted">Tablero</h3>
              <p class="text-xs text-muted">Pulsa una bola que no haya salido para marcarla.</p>
            </div>
          </template>
          <PanelItemBoard
            :items="game.items"
            :draws="game.draws"
            :disabled="admin.pending.value"
            @mark="mark"
          />
        </UCard>

        <!-- Draw sequence -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Secuencia de salida
              <span class="font-normal text-muted">({{ drawCount }})</span>
            </h3>
          </template>
          <p v-if="!drawCount" class="text-sm text-muted">Todavía no ha salido ninguna bola.</p>
          <ol v-else class="flex flex-wrap gap-1.5" aria-label="Bolas en orden de salida">
            <li
              v-for="(draw, i) in game.draws"
              :key="draw.index"
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm ring-1"
              :class="
                i === drawCount - 1
                  ? 'bg-primary font-semibold text-inverted ring-primary'
                  : 'bg-elevated/50 ring-default'
              "
              :title="mounted ? `${draw.name} · ${formatPanelTime(draw.at)}` : draw.name"
            >
              <span class="text-xs tabular-nums opacity-70">{{ i + 1 }}.</span>
              <span class="font-semibold">{{ draw.label }}</span>
            </li>
          </ol>
        </UCard>
      </div>

      <UModal v-model:open="renameOpen" title="Cambiar el nombre" :ui="{ footer: 'justify-end' }">
        <template #body>
          <form id="panel-rename-form" @submit.prevent="rename">
            <UFormField label="Nombre de la partida" :error="renameError ?? undefined" required>
              <UInput v-model="newName" class="w-full" maxlength="80" autofocus />
            </UFormField>
          </form>
        </template>
        <template #footer="{ close }">
          <UButton label="Cancelar" color="neutral" variant="outline" @click="close" />
          <UButton
            type="submit"
            form="panel-rename-form"
            label="Guardar"
            :disabled="!!renameError"
            :loading="admin.pending.value"
          />
        </template>
      </UModal>

      <PanelMessageModal v-model:open="messageOpen" />
    </template>
  </UDashboardPanel>
</template>
