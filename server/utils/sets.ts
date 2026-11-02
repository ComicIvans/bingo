import type { z } from 'zod'
import { randomCode } from '#shared/cards/random'
import { BUILTIN_SETS } from '#shared/data/builtin-sets'
import type { BingoItem, BingoSet, BingoSetSummary } from '#shared/types/bingo'

const BUILTIN_BY_ID = new Map(BUILTIN_SETS.map((set) => [set.id, set]))

export function isBuiltinSetId(id: string): boolean {
  return BUILTIN_BY_ID.has(id)
}

/** A built-in set or a custom one, or null when no set has that id. */
export async function findSet(id: string): Promise<BingoSet | null> {
  const builtin = BUILTIN_BY_ID.get(id)
  if (builtin) return builtin
  if (!SET_ID_PATTERN.test(id)) return null
  return readCustomSet(id)
}

export function toSetSummary(set: BingoSet): BingoSetSummary {
  return {
    id: set.id,
    name: set.name,
    ...(set.description ? { description: set.description } : {}),
    color: set.color,
    publicDisplay: set.publicDisplay,
    builtin: set.builtin,
    size: set.items.length,
  }
}

/** Built-in sets first (in their usual order), then custom ones by name. */
export async function listSetSummaries(): Promise<BingoSetSummary[]> {
  const custom = (await readAllCustomSets()).sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  )
  return [...BUILTIN_SETS, ...custom].map(toSetSummary)
}

/** `Tabla periódica` -> `tabla-periodica`. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
}

/** Id for a new custom set: the slug of its name, with a suffix if taken. */
export async function newSetId(name: string): Promise<string> {
  let base = slugify(name) || 'conjunto'
  // The generator names the sets it imports locally `local-<slug>`.
  if (base === 'local' || base.startsWith('local-'))
    base = `conjunto-${base}`.slice(0, 48).replace(/-+$/, '')
  let id = base
  while (isBuiltinSetId(id) || (await readCustomSet(id)))
    id = `${base}-${randomCode(4).toLowerCase()}`
  return id
}

type SetBodyInput = z.output<typeof setBodySchema>

/**
 * Builds a set from a validated body: trims labels and names, numbers the
 * items by position and rejects empty, long or repeated labels.
 */
export function buildSet(id: string, body: SetBodyInput): BingoSet {
  const seen = new Map<string, number>()
  const items: BingoItem[] = body.items.map((item, position) => {
    const index = position + 1
    const label = item.label.normalize('NFC').trim()
    if (!label) throw apiError(400, `El elemento ${index} no tiene etiqueta.`)
    if (charLength(label) > 12)
      throw apiError(400, `La etiqueta del elemento ${index} («${label}») pasa de 12 caracteres.`)
    const previous = seen.get(label)
    if (previous)
      throw apiError(
        400,
        `La etiqueta «${label}» está repetida (elementos ${previous} y ${index}). Cada elemento necesita una etiqueta distinta.`
      )
    seen.set(label, index)
    const name = (item.name ?? '').normalize('NFC').trim() || label
    if (charLength(name) > 80)
      throw apiError(400, `El nombre del elemento ${index} pasa de 80 caracteres.`)
    return { index, label, name }
  })

  return {
    id,
    name: body.name,
    ...(body.description ? { description: body.description } : {}),
    color: body.color,
    publicDisplay: body.publicDisplay,
    builtin: false,
    items,
  }
}
