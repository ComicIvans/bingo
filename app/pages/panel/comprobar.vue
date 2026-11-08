<script setup lang="ts">
import type { CardCheckResult } from '#shared/types/api'
import { FORMAT_LABELS, parseCardCode } from '#shared/cards/grid'

definePageMeta({ layout: 'panel', middleware: 'admin' })
useHead({ title: 'Comprobar cartón' })

const route = useRoute()
const router = useRouter()
const admin = useAdmin()
const toast = useToast()
const { state } = useLiveState()

const CURRENT = 'actual'

const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const gameId = ref(
  typeof route.query.game === 'string' && route.query.game ? route.query.game : CURRENT
)
const codeError = ref<string | null>(null)
const checking = ref(false)
const result = ref<CardCheckResult | null>(null)
const failure = ref<string | null>(null)

const { data: history, refresh: refreshHistory } = await useAsyncData('panel-check-history', () =>
  admin.history()
)

const liveGame = computed(() => state.value?.game ?? null)

const gameItems = computed(() => [
  {
    label: liveGame.value ? `Partida actual (${liveGame.value.name})` : 'Partida actual',
    value: CURRENT,
    icon: 'i-lucide-radio-tower',
  },
  ...(history.value ?? []).map((g) => ({
    label: `${g.name} · ${formatPanelDateTime(g.startedAt)}`,
    value: g.id,
    icon: g.status === 'running' ? 'i-lucide-play' : 'i-lucide-history',
  })),
])

// Announcing only makes sense for the game being played right now.
const canAnnounce = computed(
  () =>
    !!result.value?.game &&
    liveGame.value?.status === 'running' &&
    result.value.game.id === liveGame.value.id &&
    !result.value.setMismatch
)

const missingLabels = computed(() =>
  result.value ? result.value.check.missing.map((i) => result.value!.labels[i] ?? String(i)) : []
)

const batchFormat = computed(() => {
  const format = result.value?.batch.format
  if (!format) return ''
  if (format.kind === 'custom') return `${FORMAT_LABELS.custom} (${format.rows} × ${format.cols})`
  return FORMAT_LABELS[format.kind]
})

// Only the latest check may show its result (a typed check can start while a
// refresh is still in flight).
let lastRun = 0

/**
 * `quiet`: a background refresh of the card on screen (not of whatever is
 * being typed), with no spinner and no error replacing the result.
 */
async function runCheck(options: { quiet?: boolean } = {}) {
  // The check the user asked for is newer than any refresh; let it finish.
  if (options.quiet && checking.value) return
  const typed = options.quiet ? (result.value?.code ?? '') : code.value.trim()
  if (!typed) {
    if (!options.quiet) codeError.value = 'Escribe el código impreso en el cartón.'
    return
  }
  const parsed = parseCardCode(typed)
  if (!parsed) {
    if (!options.quiet) codeError.value = 'El código no es válido. Tiene la forma K3F9-042.'
    return
  }
  codeError.value = null
  const run = ++lastRun
  if (!options.quiet) checking.value = true
  const game = gameId.value === CURRENT ? undefined : gameId.value
  // Canonical form, whatever the user typed (lowercase, spaces, O for 0…).
  const normalized = `${parsed.batchId}-${String(parsed.number).padStart(3, '0')}`
  const checked = await admin.check(normalized, game, { quiet: true })
  if (run !== lastRun) return
  checking.value = false
  if (checked) {
    result.value = checked
    failure.value = null
    if (!options.quiet) code.value = checked.code
  } else if (!options.quiet) {
    result.value = null
    failure.value = admin.error.value
  }

  // A query change re-runs the route middleware, so only touch the URL when
  // it really changes.
  const query = { code: checked?.code ?? normalized, ...(game ? { game } : {}) }
  const currentGame = typeof route.query.game === 'string' ? route.query.game : undefined
  if (route.query.code !== query.code || currentGame !== game) router.replace({ query })
}

// Keep the result up to date while the live game goes on, and follow a new
// game when checking against the current one. Two sources, so announcements
// or renames (which replace the whole state) do not trigger a check.
watch([() => liveGame.value?.id, () => liveGame.value?.draws.length], ([id], [previousId]) => {
  if (id !== previousId) refreshHistory()
  if (!result.value) return
  if (gameId.value === CURRENT || result.value.game?.id === id) runCheck({ quiet: true })
})

watch(gameId, () => {
  if (result.value) runCheck()
})

onMounted(() => {
  if (code.value) runCheck()
})

async function announce(kind: 'line' | 'bingo') {
  if (!result.value) return
  const ok = await admin.announce({ kind, cardCode: result.value.code })
  if (ok)
    toast.add({
      title: kind === 'line' ? 'Línea anunciada' : 'Bingo anunciado',
      description: `Cartón ${result.value.code}`,
      color: 'success',
      icon: 'i-lucide-megaphone',
    })
}
</script>

<template>
  <UDashboardPanel id="panel-comprobar">
    <template #header>
      <UDashboardNavbar title="Comprobar cartón">
        <template #leading>
          <UDashboardSidebarCollapse aria-label="Mostrar u ocultar el menú" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <UCard>
          <form
            class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
            @submit.prevent="runCheck()"
          >
            <UFormField
              label="Código del cartón"
              :error="codeError ?? undefined"
              help="Puedes escribirlo en minúsculas o con espacios."
            >
              <UInput
                v-model="code"
                size="lg"
                class="w-full"
                :ui="{ base: 'font-mono uppercase' }"
                placeholder="K3F9-042"
                icon="i-lucide-ticket"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                autofocus
              />
            </UFormField>
            <UFormField label="Partida">
              <USelect
                v-model="gameId"
                :items="gameItems"
                size="lg"
                class="w-full"
                aria-label="Partida con la que comprobar"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Comprobar"
              icon="i-lucide-search-check"
              size="lg"
              class="sm:mt-6"
              :loading="checking"
              block
            />
          </form>
        </UCard>

        <UAlert
          v-if="failure && !result"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          title="No se ha podido comprobar el cartón"
          :description="failure"
        />

        <template v-if="result">
          <UCard :ui="{ body: 'space-y-5' }">
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-mono text-2xl font-bold text-highlighted">{{ result.code }}</p>
                  <p class="text-sm text-muted">
                    Lote «{{ result.batch.name }}» · {{ result.batch.setName }} · {{ batchFormat }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-1.5" aria-live="polite">
                  <UBadge
                    v-if="result.check.hasBingo"
                    label="¡Bingo!"
                    color="success"
                    size="lg"
                    icon="i-lucide-trophy"
                  />
                  <UBadge
                    v-else-if="result.check.hasLine"
                    :label="
                      result.check.completeRows.length > 1
                        ? `Línea (${result.check.completeRows.length})`
                        : 'Línea'
                    "
                    color="success"
                    variant="subtle"
                    size="lg"
                    icon="i-lucide-minus"
                  />
                  <UBadge
                    v-if="!result.check.hasBingo"
                    :label="`Faltan ${result.check.missing.length}`"
                    color="neutral"
                    variant="subtle"
                    size="lg"
                  />
                  <UBadge
                    :label="`${result.check.hits} de ${result.check.total}`"
                    color="neutral"
                    variant="outline"
                    size="lg"
                  />
                </div>
              </div>
            </template>

            <UAlert
              v-if="!result.game"
              color="warning"
              variant="subtle"
              icon="i-lucide-circle-help"
              title="No hay ninguna partida con la que comprobar"
              description="Empieza una partida o elige una del historial."
            />
            <p v-else class="text-sm text-muted">
              Comprobado con «{{ result.game.name }}»: {{ result.game.drawCount }}
              {{ result.game.drawCount === 1 ? 'bola sacada' : 'bolas sacadas' }}.
            </p>

            <UAlert
              v-if="result.setMismatch"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="El cartón es de otro conjunto"
              :description="`Este cartón es del conjunto «${result.batch.setName}», que no es el de la partida, así que la comprobación no es válida.`"
            />
            <!-- Still checkable (same set), but nobody said these cards were handed out. -->
            <UAlert
              v-else-if="result.batchInPlay === false"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="El lote de este cartón no está en juego"
              :description="`El lote ${result.batch.id} no está entre los lotes de esta partida. Puede ser un cartón de otro evento; si de verdad se ha repartido, añádelo en «Lotes en juego» de la partida.`"
            />

            <PanelCardGrid :cells="result.cells" :labels="result.labels" :check="result.check" />

            <div v-if="missingLabels.length && !result.check.hasBingo">
              <p class="mb-2 text-sm font-medium text-default">Faltan por salir</p>
              <ul class="flex flex-wrap gap-1.5" aria-label="Elementos que faltan por salir">
                <li v-for="label in missingLabels" :key="label">
                  <UBadge :label="label" color="neutral" variant="outline" />
                </li>
              </ul>
            </div>

            <template #footer>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <UButton
                  label="Anunciar línea"
                  icon="i-lucide-megaphone"
                  color="success"
                  variant="soft"
                  :disabled="!canAnnounce || admin.pending.value"
                  @click="announce('line')"
                />
                <UButton
                  label="Anunciar bingo"
                  icon="i-lucide-trophy"
                  color="success"
                  :disabled="!canAnnounce || admin.pending.value"
                  @click="announce('bingo')"
                />
                <p v-if="!canAnnounce" class="text-xs text-muted sm:ms-2">
                  {{
                    result.setMismatch
                      ? 'No se puede anunciar con un cartón de otro conjunto.'
                      : 'Solo se puede anunciar en la partida en curso.'
                  }}
                </p>
              </div>
            </template>
          </UCard>
        </template>

        <UEmpty
          v-else-if="!failure"
          icon="i-lucide-ticket-check"
          title="Comprueba un cartón"
          description="Escribe el código que aparece impreso en el cartón para ver qué casillas han salido."
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
