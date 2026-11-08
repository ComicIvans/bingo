// Card grids: which cells hold an item, and which items go where.
//
// A card is a rows x cols matrix of numbers:
//   0  -> empty cell
//   -1 -> free cell (the centre of a 75-ball card)
//   n  -> the item whose `index` is n
//
// Generation is deterministic: the same engine version, seed, grid spec,
// item indices and card number always give the same card. The server relies
// on this to check a printed card from its batch, so a batch keeps the engine
// version it was printed with and old versions must never change.

import { createRng, sample, shuffleInPlace, type Rng } from './random.ts'

export const EMPTY = 0
export const FREE = -1

export type CardFormat =
  | { kind: 'classic90' }
  | { kind: 'american75'; freeCenter: boolean }
  | {
      kind: 'custom'
      rows: number
      cols: number
      /** Cells with an item per row (a free cell counts as one). */
      perRow: number
      /** Max items per column. */
      maxPerColumn: number
      /** Columns take consecutive ranges of the set, sorted top to bottom. */
      columnOrder: boolean
      /** Free centre cell (needs odd rows and columns). */
      freeCenter: boolean
    }

export interface GridSpec {
  rows: number
  cols: number
  perRow: number
  maxPerColumn: number
  columnOrder: boolean
  freeCenter: boolean
}

export type CardCells = number[][]

export interface GeneratedCard {
  /** Number printed on the card (part of its code). */
  number: number
  cells: CardCells
}

export const FORMAT_LABELS: Record<CardFormat['kind'], string> = {
  classic90: 'Clásico (3 × 9, 15 casillas)',
  american75: 'Americano (5 × 5)',
  custom: 'Personalizado',
}

export function gridSpecFor(format: CardFormat): GridSpec {
  switch (format.kind) {
    case 'classic90':
      // The original generator never filled a whole column; keep that look.
      return { rows: 3, cols: 9, perRow: 5, maxPerColumn: 2, columnOrder: true, freeCenter: false }
    case 'american75':
      return {
        rows: 5,
        cols: 5,
        perRow: 5,
        maxPerColumn: 5,
        columnOrder: true,
        freeCenter: format.freeCenter,
      }
    case 'custom':
      return {
        rows: format.rows,
        cols: format.cols,
        perRow: format.perRow,
        maxPerColumn: format.maxPerColumn,
        columnOrder: format.columnOrder,
        freeCenter: format.freeCenter && format.rows % 2 === 1 && format.cols % 2 === 1,
      }
  }
}

function isFreeCell(spec: GridSpec, row: number, col: number): boolean {
  return spec.freeCenter && row === (spec.rows - 1) / 2 && col === (spec.cols - 1) / 2
}

/** Splits the sorted item indices into `cols` consecutive, near-equal ranges. */
export function columnBuckets(indices: readonly number[], cols: number): number[][] {
  const sorted = [...indices].sort((a, b) => a - b)
  const base = Math.floor(sorted.length / cols)
  const extra = sorted.length % cols
  const buckets: number[][] = []
  let start = 0
  for (let c = 0; c < cols; c++) {
    const size = base + (c < extra ? 1 : 0)
    buckets.push(sorted.slice(start, start + size))
    start += size
  }
  return buckets
}

/** Number of items one card holds. */
export function itemsPerCard(spec: GridSpec): number {
  return spec.rows * spec.perRow - (spec.freeCenter ? 1 : 0)
}

function columnCaps(spec: GridSpec, bucketSizes: number[] | null): number[] {
  return Array.from({ length: spec.cols }, (_, c) => {
    let free = 0
    for (let r = 0; r < spec.rows; r++) if (isFreeCell(spec, r, c)) free++
    const cap = Math.min(spec.rows - free, spec.maxPerColumn)
    return bucketSizes ? Math.min(cap, bucketSizes[c]!) : cap
  })
}

/**
 * Returns a list of problems that make the spec unusable with `setSize`
 * items, in Spanish (shown as is by the generator). Empty when valid.
 */
export function validateSpec(spec: GridSpec, setSize: number): string[] {
  const errors: string[] = []
  if (spec.rows < 1 || spec.rows > 12) errors.push('Las filas deben estar entre 1 y 12.')
  if (spec.cols < 1 || spec.cols > 12) errors.push('Las columnas deben estar entre 1 y 12.')
  if (spec.perRow < 1 || spec.perRow > spec.cols)
    errors.push('Las casillas llenas por fila deben estar entre 1 y el número de columnas.')
  if (spec.maxPerColumn < 1) errors.push('El máximo por columna debe ser al menos 1.')
  if (errors.length) return errors

  const needed = itemsPerCard(spec)
  if (needed > setSize)
    errors.push(`Cada cartón necesita ${needed} elementos y el conjunto solo tiene ${setSize}.`)

  const bucketSizes = spec.columnOrder
    ? columnBuckets(
        Array.from({ length: setSize }, (_, i) => i + 1),
        spec.cols
      ).map((b) => b.length)
    : null
  const caps = columnCaps(spec, bucketSizes)
  const capacity = caps.reduce((a, b) => a + b, 0)
  if (capacity < needed)
    errors.push(
      'Con esa combinación de filas, columnas y máximo por columna no caben todos los elementos.'
    )
  return errors
}

/**
 * Chooses which cells hold an item: each row gets exactly `perRow` cells
 * (counting the free cell), each column stays within its cap and, when there
 * are enough cells, no column is left empty.
 */
function fillPattern(spec: GridSpec, caps: number[], rng: Rng): boolean[][] | null {
  const { rows, cols } = spec
  const filled = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  const need = Array.from({ length: rows }, () => spec.perRow)
  const colCount = Array<number>(cols).fill(0)

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (isFreeCell(spec, r, c)) {
        filled[r]![c] = true
        need[r]!--
      }

  const totalNeed = need.reduce((a, b) => a + b, 0)
  const coverable = caps.filter((cap) => cap > 0).length
  const coverColumns = totalNeed >= coverable

  if (coverColumns) {
    // Give every column one item first, in a row that still has room
    // (rows with more room left are more likely, to avoid dead ends).
    for (const c of shuffleInPlace(
      Array.from({ length: cols }, (_, i) => i),
      rng
    )) {
      if (caps[c] === 0) continue
      const candidates: number[] = []
      for (let r = 0; r < rows; r++)
        if (need[r]! > 0 && !filled[r]![c]) for (let w = 0; w < need[r]!; w++) candidates.push(r)
      if (!candidates.length) return null
      const r = candidates[rng.int(candidates.length)]!
      filled[r]![c] = true
      need[r]!--
      colCount[c]!++
    }
  }

  for (let r = 0; r < rows; r++) {
    const options: number[] = []
    for (let c = 0; c < cols; c++) if (!filled[r]![c] && colCount[c]! < caps[c]!) options.push(c)
    if (options.length < need[r]!) return null
    for (const c of sample(options, need[r]!, rng)) {
      filled[r]![c] = true
      colCount[c]!++
    }
  }
  return filled
}

function buildCard(
  spec: GridSpec,
  indices: readonly number[],
  buckets: number[][] | null,
  caps: number[],
  rng: Rng
): CardCells | null {
  const pattern = fillPattern(spec, caps, rng)
  if (!pattern) return null
  const cells: CardCells = pattern.map((row, r) =>
    row.map((on, c) => (isFreeCell(spec, r, c) ? FREE : on ? 1 : EMPTY))
  )

  if (buckets) {
    for (let c = 0; c < spec.cols; c++) {
      const rowsInCol: number[] = []
      for (let r = 0; r < spec.rows; r++) if (cells[r]![c] === 1) rowsInCol.push(r)
      const picked = sample(buckets[c]!, rowsInCol.length, rng).sort((a, b) => a - b)
      rowsInCol.forEach((r, i) => (cells[r]![c] = picked[i]!))
    }
  } else {
    const slots: [number, number][] = []
    for (let r = 0; r < spec.rows; r++)
      for (let c = 0; c < spec.cols; c++) if (cells[r]![c] === 1) slots.push([r, c])
    const picked = sample(indices, slots.length, rng)
    slots.forEach(([r, c], i) => (cells[r]![c] = picked[i]!))
  }
  return cells
}

/** Identity of a card for duplicate detection: the set of items it holds. */
export function cardSignature(cells: CardCells): string {
  return cells
    .flat()
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
    .join(',')
}

/**
 * Version of the generation algorithm used for new batches. Batches stored
 * without a version were made with version 1. Changing what any existing
 * version generates breaks the check of every card printed with it.
 */
export const ENGINE_VERSION = 1
export const ENGINE_VERSIONS: readonly number[] = [1]

export interface BatchParams {
  /** Engine version the batch was (or will be) generated with. */
  engine: number
  seed: string
  spec: GridSpec
  /** Item indices of the set the cards draw from. */
  indices: readonly number[]
  count: number
  /** Number printed on the first card. */
  firstNumber?: number
}

export class CardGenerationError extends Error {}

const ATTEMPTS_PER_CARD = 200

/**
 * Generates `count` distinct cards. Card i only depends on the seed, the
 * spec, the indices and the cards before it (for duplicate avoidance), so
 * regenerating a prefix of the batch gives the same cards.
 */
export function generateBatch(params: BatchParams): GeneratedCard[] {
  const { engine, seed, spec, indices, count } = params
  const firstNumber = params.firstNumber ?? 1
  if (!ENGINE_VERSIONS.includes(engine))
    throw new CardGenerationError(`Versión del generador desconocida: ${engine}.`)
  const errors = validateSpec(spec, indices.length)
  if (errors.length) throw new CardGenerationError(errors[0])

  const buckets = spec.columnOrder ? columnBuckets(indices, spec.cols) : null
  const caps = columnCaps(spec, buckets ? buckets.map((b) => b.length) : null)
  const seen = new Set<string>()
  const cards: GeneratedCard[] = []

  for (let i = 0; i < count; i++) {
    const number = firstNumber + i
    let cells: CardCells | null = null
    for (let attempt = 0; attempt < ATTEMPTS_PER_CARD && !cells; attempt++) {
      const candidate = buildCard(
        spec,
        indices,
        buckets,
        caps,
        createRng(`${seed}/${i}/${attempt}`)
      )
      if (candidate && !seen.has(cardSignature(candidate))) cells = candidate
    }
    if (!cells)
      throw new CardGenerationError(
        `No se pueden generar ${count} cartones distintos con este conjunto y formato (se llegó al ${number}).`
      )
    seen.add(cardSignature(cells))
    cards.push({ number, cells })
  }
  return cards
}

/** Regenerates a single card of a batch (needs the cards before it). */
export function regenerateCard(params: Omit<BatchParams, 'count'>, number: number) {
  const firstNumber = params.firstNumber ?? 1
  const position = number - firstNumber
  if (position < 0) return null
  return generateBatch({ ...params, count: position + 1 })[position] ?? null
}

/** Card code printed on each card: `<batch>-<number>`, e.g. `K3F9-042`. */
export function cardCode(batchId: string, number: number, lastNumber: number): string {
  const digits = Math.max(3, String(lastNumber).length)
  return `${batchId}-${String(number).padStart(digits, '0')}`
}

/** Parses a typed card code (tolerates spaces, lowercase and missing dash). */
export function parseCardCode(input: string): { batchId: string; number: number } | null {
  const clean = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  const match = clean.match(/^([0-9A-Z]{4})(\d{1,6})$/)
  if (!match) return null
  return { batchId: match[1]!, number: Number(match[2]) }
}
