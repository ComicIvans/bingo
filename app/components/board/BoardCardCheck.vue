<script setup lang="ts">
import type { BoardCheckResult, GameBatch } from '#shared/types/api'

// Card check for the volunteers on the board, built for phones: a button fixed
// at the bottom opens a sheet where they type only the card number (the batch
// prefix is already there). Read-only: announcing stays in the panel.

const props = defineProps<{
  /** Batches in play in the current game. */
  batches: GameBatch[]
  /** Draws so far, to refresh an open result when a new ball comes out. */
  drawCount: number
}>()

const open = ref(false)

// ─── Prefix ────────────────────────────────────────────────────────────────

// Remembered on this phone; falls back when that batch is no longer in play.
const savedPrefix = useLocalStorage('bingo:tablero:lote', '', { initOnMounted: true })
const prefix = computed(() => {
  const ids = props.batches.map((batch) => batch.id)
  return ids.includes(savedPrefix.value) ? savedPrefix.value : (ids[0] ?? '')
})
const chosenBatch = computed(() => props.batches.find((batch) => batch.id === prefix.value))

// ─── Input ─────────────────────────────────────────────────────────────────

/** The card number, or the whole code when no batch is in play. */
const typed = ref('')
const input = useTemplateRef<{ inputRef?: HTMLInputElement }>('input')

const numberOnly = computed(() => props.batches.length > 0)
const fullCode = computed(() =>
  numberOnly.value ? `${prefix.value}-${typed.value.trim()}` : typed.value.trim()
)
const canCheck = computed(() =>
  numberOnly.value ? /^\d{1,6}$/.test(typed.value.trim()) : typed.value.trim().length >= 5
)

function focusInput() {
  nextTick(() => input.value?.inputRef?.focus())
}

// ─── Check ─────────────────────────────────────────────────────────────────

const result = ref<BoardCheckResult | null>(null)
const error = ref<string | null>(null)
const checking = ref(false)
let lastRun = 0

interface FetchFailure {
  status?: number
  statusCode?: number
  data?: { statusMessage?: string; message?: string }
}

function failureMessage(e: unknown): string {
  const failure = e as FetchFailure
  const text = failure?.data?.statusMessage || failure?.data?.message
  if (text) return text
  const status = failure?.statusCode ?? failure?.status ?? 0
  if (!status) return 'No se ha podido conectar con el servidor. Comprueba la conexión.'
  return 'No se ha podido comprobar el cartón. Vuelve a intentarlo.'
}

async function check(code = fullCode.value, quiet = false) {
  if (!code) return
  const run = ++lastRun
  if (!quiet) {
    checking.value = true
    error.value = null
  }
  try {
    const found = await $fetch<BoardCheckResult>('/api/board/check', { query: { code } })
    if (run === lastRun) result.value = found
  } catch (e) {
    if (run === lastRun && !quiet) {
      result.value = null
      error.value = failureMessage(e)
    }
  } finally {
    if (run === lastRun) checking.value = false
  }
}

function submit() {
  if (canCheck.value && !checking.value) check()
}

function another() {
  result.value = null
  error.value = null
  typed.value = ''
  focusInput()
}

function pickBatch(id: string) {
  savedPrefix.value = id
  result.value = null
  error.value = null
  focusInput()
}

// A card left on screen follows the game.
watch(
  () => props.drawCount,
  () => {
    if (open.value && result.value) check(result.value.code, true)
  }
)

watch(open, (value) => {
  if (value) focusInput()
})

// ─── Result ────────────────────────────────────────────────────────────────

const status = computed(() => {
  const r = result.value
  if (!r) return null
  if (r.check.hasBingo)
    return { title: '¡Bingo!', text: 'Han salido todas las casillas.', color: 'success' as const }
  if (r.check.hasLine) {
    const rows = r.check.completeRows.map((row) => row + 1)
    return {
      title: '¡Línea!',
      text:
        rows.length === 1 ? `Fila ${rows[0]} completa.` : `Filas ${rows.join(' y ')} completas.`,
      color: 'success' as const,
    }
  }
  const missing = r.check.missing.length
  return {
    title: missing === 1 ? 'Falta 1' : `Faltan ${missing}`,
    text: `Ni línea ni bingo todavía (${r.check.hits} de ${r.check.total}).`,
    color: 'neutral' as const,
  }
})

const missingLabels = computed(() =>
  result.value ? result.value.check.missing.map((i) => result.value!.labels[i] ?? String(i)) : []
)
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-default/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-default/75"
  >
    <UButton
      label="Comprobar cartón"
      icon="i-lucide-ticket-check"
      size="xl"
      block
      class="mx-auto max-w-md"
      @click="open = true"
    />
  </div>

  <UDrawer
    v-model:open="open"
    title="Comprobar cartón"
    :description="
      numberOnly
        ? 'Escribe el número del cartón.'
        : 'Escribe el código impreso en el cartón, por ejemplo K3F9-042.'
    "
    :ui="{ content: 'max-h-[92dvh]', body: 'overflow-y-auto' }"
  >
    <template #body>
      <form class="mx-auto flex w-full max-w-md flex-col gap-4 pb-4" @submit.prevent="submit">
        <!-- Several batches in play: pick the one printed on the card. -->
        <div v-if="batches.length > 1" class="flex flex-col gap-1.5">
          <p id="board-check-batch" class="text-sm font-medium text-highlighted">Lote</p>
          <div
            role="radiogroup"
            aria-labelledby="board-check-batch"
            class="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            <UButton
              v-for="batch in batches"
              :key="batch.id"
              role="radio"
              :aria-checked="batch.id === prefix"
              :variant="batch.id === prefix ? 'solid' : 'outline'"
              color="neutral"
              size="lg"
              block
              class="flex-col gap-0 py-2"
              @click="pickBatch(batch.id)"
            >
              <span class="font-mono text-base font-bold tracking-wider">{{ batch.id }}</span>
              <span class="text-xs font-normal opacity-80">
                del {{ batch.firstNumber }} al {{ batch.lastNumber }}
              </span>
            </UButton>
          </div>
        </div>

        <UFormField
          :label="numberOnly ? 'Número del cartón' : 'Código del cartón'"
          :help="
            numberOnly && chosenBatch && batches.length === 1
              ? `Lote ${chosenBatch.id}: cartones del ${chosenBatch.firstNumber} al ${chosenBatch.lastNumber}.`
              : undefined
          "
        >
          <UFieldGroup size="xl" class="w-full">
            <UBadge
              v-if="numberOnly"
              :label="`${prefix}-`"
              color="neutral"
              variant="soft"
              class="font-mono text-xl font-bold tracking-wider"
              aria-hidden="true"
            />
            <UInput
              ref="input"
              v-model="typed"
              class="min-w-0 flex-1"
              autocomplete="off"
              enterkeyhint="search"
              :inputmode="numberOnly ? 'numeric' : 'text'"
              :pattern="numberOnly ? '[0-9]*' : undefined"
              :maxlength="numberOnly ? 6 : 20"
              :placeholder="numberOnly ? '42' : 'K3F9-042'"
              :aria-label="numberOnly ? `Número del cartón del lote ${prefix}` : undefined"
              :ui="{ base: 'font-mono text-xl tracking-wider' }"
            />
          </UFieldGroup>
        </UFormField>

        <UButton
          type="submit"
          label="Comprobar"
          icon="i-lucide-search-check"
          size="xl"
          block
          :loading="checking"
          :disabled="!canCheck"
        />

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          :title="error"
        />

        <section v-if="result && status" class="flex flex-col gap-3" aria-live="polite">
          <div
            class="flex items-center justify-between gap-3 rounded-lg p-3"
            :class="status.color === 'success' ? 'bg-success/10' : 'bg-elevated/60'"
          >
            <div class="min-w-0">
              <p
                class="font-display text-2xl font-bold"
                :class="
                  status.color === 'success'
                    ? 'text-(--ui-color-success-800) dark:text-(--ui-color-success-300)'
                    : 'text-highlighted'
                "
              >
                {{ status.title }}
              </p>
              <p class="text-sm text-muted">{{ status.text }}</p>
            </div>
            <p class="shrink-0 font-mono text-lg font-bold text-highlighted">{{ result.code }}</p>
          </div>

          <UAlert
            v-if="result.batchInPlay === false"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Este lote no está en juego"
            description="Avisa a la mesa: puede ser un cartón de otro evento."
          />

          <PanelCardGrid :cells="result.cells" :labels="result.labels" :check="result.check" />

          <div v-if="missingLabels.length && !result.check.hasBingo">
            <p class="mb-1.5 text-sm font-medium text-highlighted">Faltan por salir</p>
            <ul class="flex flex-wrap gap-1.5">
              <li v-for="label in missingLabels" :key="label">
                <UBadge :label="label" color="neutral" variant="outline" size="lg" />
              </li>
            </ul>
          </div>

          <p class="text-xs text-muted">
            Comprobado con «{{ result.game.name }}»: {{ result.game.drawCount }}
            {{ result.game.drawCount === 1 ? 'bola' : 'bolas' }}. Se actualiza solo si sale otra.
          </p>

          <UButton
            label="Comprobar otro cartón"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="outline"
            size="lg"
            block
            @click="another"
          />
        </section>
      </form>
    </template>
  </UDrawer>
</template>
