import type { BingoSet, BingoSetSummary } from '#shared/types/bingo'
import { apiMessage } from '~/utils/generator/errors'

// Sets for the generator. When the server does not answer, the generator
// keeps working with the built-in sets (loaded on demand).

let builtinSets: BingoSet[] | null = null

async function loadBuiltinSets(): Promise<BingoSet[]> {
  if (!builtinSets) builtinSets = (await import('#shared/data/builtin-sets')).BUILTIN_SETS
  return builtinSets
}

function summaryOf(set: BingoSet): BingoSetSummary {
  return {
    id: set.id,
    name: set.name,
    description: set.description,
    color: set.color,
    publicDisplay: set.publicDisplay,
    builtin: set.builtin,
    size: set.items.length,
  }
}

export function useGeneratorSets() {
  const list = ref<BingoSetSummary[]>([])
  /** True when the list comes from the built-in copy because the server failed. */
  const offline = ref(false)
  const current = shallowRef<BingoSet | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const cache = new Map<string, BingoSet>()
  let token = 0

  async function loadList(): Promise<void> {
    try {
      list.value = await $fetch<BingoSetSummary[]>('/api/sets')
      offline.value = false
    } catch {
      list.value = (await loadBuiltinSets()).map(summaryOf)
      offline.value = true
    }
  }

  /** Loads a set's items; the latest call wins when several overlap. */
  async function select(id: string): Promise<BingoSet | null> {
    const mine = ++token
    const cached = cache.get(id)
    if (cached) {
      current.value = cached
      error.value = null
      loading.value = false
      return cached
    }
    loading.value = true
    error.value = null
    try {
      const set = offline.value
        ? (await loadBuiltinSets()).find((s) => s.id === id)
        : await $fetch<BingoSet>(`/api/sets/${encodeURIComponent(id)}`)
      if (!set) throw new Error('No existe ese conjunto.')
      cache.set(id, set)
      if (mine === token) current.value = set
      return set
    } catch (e) {
      if (mine === token) {
        current.value = null
        error.value = apiMessage(e, 'No se pudo cargar el conjunto. Inténtalo de nuevo.')
      }
      return null
    } finally {
      if (mine === token) loading.value = false
    }
  }

  /** Fetches a server set again, bypassing the cache; shows it if it is still selected. */
  async function refresh(id: string): Promise<BingoSet> {
    const set = await $fetch<BingoSet>(`/api/sets/${encodeURIComponent(id)}`)
    cache.set(id, set)
    if (current.value?.id === id) current.value = set
    const summary = list.value.find((s) => s.id === id)
    if (summary) summary.size = set.items.length
    return set
  }

  return { list, offline, current, loading, error, loadList, select, refresh }
}
