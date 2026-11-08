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
      /** Columns take consecutive ranges of the set. */
      columnOrder: boolean
      /**
       * With column order, items go from lowest to highest top to bottom
       * (missing: true). Version 1 always sorts them.
       */
      sortColumns?: boolean
      /** Free centre cell (needs odd rows and columns). */
      freeCenter: boolean
    }

export interface GridSpec {
  rows: number
  cols: number
  perRow: number
  maxPerColumn: number
  /** Columns take consecutive ranges of the set. */
  columnOrder: boolean
  /** With column order, items sorted top to bottom (version 1 always sorts). */
  sortColumns: boolean
  /**
   * With column order and 10 items per column, ranges go by tens: 1-9,
   * 10-19 … 80-90 (from version 2).
   */
  tens: boolean
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
      return {
        rows: 3,
        cols: 9,
        perRow: 5,
        maxPerColumn: 2,
        columnOrder: true,
        sortColumns: true,
        tens: true,
        freeCenter: false,
      }
    case 'american75':
      // B 1-15, I 16-30 … in any order within the column, as usual: sorted
      // columns put the lowest numbers of every card on its top row.
      return {
        rows: 5,
        cols: 5,
        perRow: 5,
        maxPerColumn: 5,
        columnOrder: true,
        sortColumns: false,
        tens: false,
        freeCenter: format.freeCenter,
      }
    case 'custom':
      return {
        rows: format.rows,
        cols: format.cols,
        perRow: format.perRow,
        maxPerColumn: format.maxPerColumn,
        columnOrder: format.columnOrder,
        sortColumns: format.sortColumns ?? true,
        tens: false,
        freeCenter: format.freeCenter && format.rows % 2 === 1 && format.cols % 2 === 1,
      }
  }
}

function isFreeCell(spec: GridSpec, row: number, col: number): boolean {
  return spec.freeCenter && row === (spec.rows - 1) / 2 && col === (spec.cols - 1) / 2
}

/**
 * Splits the sorted item indices into `cols` consecutive ranges: near-equal,
 * or by tens (one less in the first column, one more in the last: 1-9,
 * 10-19 … 80-90) when `tens` is set and there are 10 items per column.
 */
export function columnBuckets(indices: readonly number[], cols: number, tens = false): number[][] {
  const sorted = [...indices].sort((a, b) => a - b)
  const byTens = tens && cols > 1 && sorted.length === cols * 10
  const base = Math.floor(sorted.length / cols)
  const extra = sorted.length % cols
  const buckets: number[][] = []
  let start = 0
  for (let c = 0; c < cols; c++) {
    const size = byTens
      ? 10 - (c === 0 ? 1 : 0) + (c === cols - 1 ? 1 : 0)
      : base + (c < extra ? 1 : 0)
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
        spec.cols,
        spec.tens
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

// ─── Version 1 (frozen) ────────────────────────────────────────────────────
// Kept exactly as printed batches were made: never change what it generates.

/**
 * Chooses which cells hold an item: each row gets exactly `perRow` cells
 * (counting the free cell), each column stays within its cap and, when there
 * are enough cells, no column is left empty. Fills rows one by one, so tight
 * specs often dead-end (null), and its patterns are not equally likely.
 */
function fillPatternV1(spec: GridSpec, caps: number[], rng: Rng): boolean[][] | null {
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

function buildCardV1(
  spec: GridSpec,
  indices: readonly number[],
  buckets: number[][] | null,
  caps: number[],
  rng: Rng
): CardCells | null {
  const pattern = fillPatternV1(spec, caps, rng)
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

// ─── Version 2 ─────────────────────────────────────────────────────────────

/** Proposals tried before building the pattern step by step. */
const REJECTION_TRIES = 100
/** Below this acceptance rate the proposals are skipped (they would mostly fail). */
const MIN_ACCEPTANCE = 0.03

/** What every pattern of a spec shares: needs per row, usable cells, columns to cover. */
interface PatternSetup {
  spec: GridSpec
  caps: number[]
  need: number[]
  /** Columns each row can use (not the free cell, room in the column). */
  allowed: number[][]
  /** Column that must hold an item (the free cell covers its own). */
  mustCover: (col: number) => boolean
  /** Whether drawing rows at random is accepted often enough to try it. */
  propose: boolean
}

function patternSetup(spec: GridSpec, caps: number[]): PatternSetup {
  const { rows, cols } = spec
  const need = Array.from({ length: rows }, () => spec.perRow)
  const allowed: number[][] = []
  let freeCol = -1
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      if (isFreeCell(spec, r, c)) {
        need[r]!--
        freeCol = c
      } else if (caps[c]! > 0) row.push(c)
    }
    allowed.push(row)
  }
  const toCover = caps.filter((cap, c) => cap > 0 && c !== freeCol).length
  const cover = need.reduce((a, b) => a + b, 0) >= toCover
  const setup: PatternSetup = {
    spec,
    caps,
    need,
    allowed,
    mustCover: (c) => cover && c !== freeCol && caps[c]! > 0,
    propose: true,
  }
  // The rate only depends on the spec, so this choice is the same every time.
  const rng = createRng(`acceptance/${JSON.stringify(spec)}/${caps.join(',')}`)
  let accepted = 0
  const trials = 400
  for (let t = 0; t < trials; t++) if (proposePattern(setup, rng)) accepted++
  setup.propose = accepted / trials >= MIN_ACCEPTANCE
  return setup
}

/** Each row drawn at random among its usable columns; null if a column breaks a rule. */
function proposePattern(setup: PatternSetup, rng: Rng): boolean[][] | null {
  const { spec, caps, need, allowed, mustCover } = setup
  const filled = Array.from({ length: spec.rows }, () => Array<boolean>(spec.cols).fill(false))
  const count = Array<number>(spec.cols).fill(0)
  for (let r = 0; r < spec.rows; r++)
    for (const c of sample(allowed[r]!, need[r]!, rng)) {
      filled[r]![c] = true
      if (++count[c]! > caps[c]!) return null
    }
  return count.every((n, c) => n > 0 || !mustCover(c)) ? filled : null
}

/**
 * Same rules as version 1, with every valid pattern equally likely and no
 * dead ends: the free cell covers its column, and a pattern is always found
 * when validateSpec accepts the spec.
 *
 * It first draws each row at random and keeps the first draw that satisfies
 * every column (exactly uniform; the classic card is accepted about 1 in 14
 * times). Tight specs, where that rarely happens, get a pattern built
 * greedily and then shuffled by random moves that keep it valid.
 */
function fillPatternV2(setup: PatternSetup, rng: Rng): boolean[][] {
  const { spec, caps, need, allowed, mustCover } = setup
  const { rows, cols } = spec
  const withFree = (filled: boolean[][]) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (isFreeCell(spec, r, c)) filled[r]![c] = true
    return filled
  }

  if (setup.propose)
    for (let t = 0; t < REJECTION_TRIES; t++) {
      const filled = proposePattern(setup, rng)
      if (filled) return withFree(filled)
    }

  // Greedy: each row takes the columns with most room left (ties at random).
  // The row of the free cell goes first: once it has chosen, every other row
  // can use every column, and then this never gets stuck when there is room
  // enough in total.
  const filled = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  const count = Array<number>(cols).fill(0)
  const rowOrder = shuffleInPlace(
    Array.from({ length: rows }, (_, i) => i),
    rng
  ).sort((a, b) => allowed[a]!.length - allowed[b]!.length)
  for (const r of rowOrder) {
    const options = shuffleInPlace(
      allowed[r]!.filter((c) => count[c]! < caps[c]!),
      rng
    ).sort((a, b) => caps[b]! - count[b]! - (caps[a]! - count[a]!))
    if (options.length < need[r]!) throw new CardGenerationError('No caben los elementos.')
    for (const c of options.slice(0, need[r]!)) {
      filled[r]![c] = true
      count[c]!++
    }
  }
  // Cover empty columns with items from a column that can spare one.
  for (let c = 0; c < cols; c++) {
    if (!mustCover(c) || count[c]! > 0) continue
    const donors: [number, number][] = []
    for (let r = 0; r < rows; r++)
      for (const d of allowed[r]!)
        if (filled[r]![d] && (count[d]! > 1 || !mustCover(d))) donors.push([r, d])
    const [r, d] = donors[rng.int(donors.length)]!
    filled[r]![d] = false
    filled[r]![c] = true
    count[d]!--
    count[c]!++
  }
  // Random valid moves (symmetric proposals, so in the long run every
  // reachable pattern is equally likely): move an item within its row, or
  // swap a 2 × 2 checkerboard between two rows.
  const open = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => allowed[r]!.includes(c))
  )
  const steps = 20 * rows * cols
  for (let step = 0; step < steps; step++) {
    if (rows > 1 && cols > 1 && rng.next() < 0.5) {
      const r1 = rng.int(rows)
      const r2 = (r1 + 1 + rng.int(rows - 1)) % rows
      const c1 = rng.int(cols)
      const c2 = (c1 + 1 + rng.int(cols - 1)) % cols
      if (
        filled[r1]![c1] &&
        filled[r2]![c2] &&
        !filled[r1]![c2] &&
        !filled[r2]![c1] &&
        open[r1]![c2] &&
        open[r2]![c1]
      ) {
        filled[r1]![c1] = filled[r2]![c2] = false
        filled[r1]![c2] = filled[r2]![c1] = true
      }
    } else {
      const r = rng.int(rows)
      const row = allowed[r]!
      if (!row.length) continue
      const a = row[rng.int(row.length)]!
      const b = row[rng.int(row.length)]!
      if (!filled[r]![a] || filled[r]![b]) continue
      if (count[b]! >= caps[b]! || (mustCover(a) && count[a] === 1)) continue
      filled[r]![a] = false
      filled[r]![b] = true
      count[a]!--
      count[b]!++
    }
  }
  return withFree(filled)
}

function buildCardV2(
  setup: PatternSetup,
  indices: readonly number[],
  buckets: number[][] | null,
  rng: Rng
): CardCells {
  const { spec } = setup
  const pattern = fillPatternV2(setup, rng)
  const cells: CardCells = pattern.map((row, r) =>
    row.map((on, c) => (isFreeCell(spec, r, c) ? FREE : on ? 1 : EMPTY))
  )
  if (buckets) {
    for (let c = 0; c < spec.cols; c++) {
      const rowsInCol: number[] = []
      for (let r = 0; r < spec.rows; r++) if (cells[r]![c] === 1) rowsInCol.push(r)
      // sample() returns them in random order.
      const picked = sample(buckets[c]!, rowsInCol.length, rng)
      if (spec.sortColumns) picked.sort((a, b) => a - b)
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

// ─── Batches ───────────────────────────────────────────────────────────────

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
 *
 * 1. Original generator.
 * 2. Equally likely patterns, no dead ends on tight specs, the free cell
 *    covers its column, classic columns by tens and unsorted 75-ball columns.
 */
export const ENGINE_VERSION = 2
export const ENGINE_VERSIONS: readonly number[] = [1, 2]

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

export class CardGenerationError extends Error {
  /** Cards generated before the failure (they can still be checked). */
  partial: GeneratedCard[]
  constructor(message: string, partial: GeneratedCard[] = []) {
    super(message)
    this.partial = partial
  }
}

const ATTEMPTS_PER_CARD = 200

/**
 * Generates `count` distinct cards. Card i only depends on the engine
 * version, the seed, the spec, the indices and the cards before it (for
 * duplicate avoidance), so regenerating a prefix of the batch gives the same
 * cards.
 */
export function generateBatch(params: BatchParams): GeneratedCard[] {
  const { engine, seed, spec, indices, count } = params
  const firstNumber = params.firstNumber ?? 1
  if (!ENGINE_VERSIONS.includes(engine))
    throw new CardGenerationError(`Versión del generador desconocida: ${engine}.`)
  const errors = validateSpec(spec, indices.length)
  if (errors.length) throw new CardGenerationError(errors[0]!)

  const v1 = engine === 1
  const buckets = spec.columnOrder ? columnBuckets(indices, spec.cols, !v1 && spec.tens) : null
  const caps = columnCaps(spec, buckets ? buckets.map((b) => b.length) : null)
  const setup = v1 ? null : patternSetup(spec, caps)
  const build = (rng: Rng) =>
    setup
      ? buildCardV2(setup, indices, buckets, rng)
      : buildCardV1(spec, indices, buckets, caps, rng)
  const seen = new Set<string>()
  const cards: GeneratedCard[] = []

  for (let i = 0; i < count; i++) {
    const number = firstNumber + i
    let cells: CardCells | null = null
    let built = false
    for (let attempt = 0; attempt < ATTEMPTS_PER_CARD && !cells; attempt++) {
      const candidate = build(createRng(`${seed}/${i}/${attempt}`))
      if (candidate) built = true
      if (candidate && !seen.has(cardSignature(candidate))) cells = candidate
    }
    if (!cells)
      throw new CardGenerationError(
        built
          ? `No se pueden generar ${count} cartones distintos con este conjunto y formato (se llegó al ${number}).`
          : 'No se han podido repartir las casillas con esta combinación de filas, columnas y máximo por columna. Prueba con otra.',
        cards
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
