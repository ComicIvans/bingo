import { describe, expect, it } from 'vitest'
import {
  ENGINE_VERSION,
  EMPTY,
  FREE,
  cardCode,
  cardSignature,
  columnBuckets,
  generateBatch,
  gridSpecFor,
  parseCardCode,
  regenerateCard,
  validateSpec,
  type CardFormat,
  type GridSpec,
} from '../shared/cards/grid'
import { checkCard } from '../shared/cards/check'
import { computeImposition, planPages, DEFAULT_SHEET } from '../shared/cards/impose'

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

function assertCardValid(cells: number[][], spec: GridSpec, indices: number[]) {
  expect(cells).toHaveLength(spec.rows)
  const buckets = spec.columnOrder ? columnBuckets(indices, spec.cols, spec.tens) : null
  const seen = new Set<number>()
  let coverable = 0
  for (let c = 0; c < spec.cols; c++) {
    const column = cells.map((row) => row[c]!)
    const items = column.filter((v) => v > 0)
    expect(items.length).toBeLessThanOrEqual(spec.maxPerColumn)
    if (buckets) {
      for (const v of items) expect(buckets[c]).toContain(v)
      if (spec.sortColumns) expect([...items].sort((a, b) => a - b)).toEqual(items)
    }
    if (items.length || column.includes(FREE)) coverable++
  }
  for (const [r, row] of cells.entries()) {
    expect(row).toHaveLength(spec.cols)
    expect(row.filter((v) => v !== EMPTY)).toHaveLength(spec.perRow)
    for (const [c, v] of row.entries()) {
      if (v === FREE) {
        expect(spec.freeCenter).toBe(true)
        expect([r, c]).toEqual([(spec.rows - 1) / 2, (spec.cols - 1) / 2])
      }
      if (v > 0) {
        expect(indices).toContain(v)
        expect(seen.has(v)).toBe(false)
        seen.add(v)
      }
    }
  }
  // No empty column when the card has at least one item per column.
  if (spec.rows * spec.perRow >= spec.cols) expect(coverable).toBe(spec.cols)
}

const FORMATS: [string, CardFormat, number][] = [
  ['classic90', { kind: 'classic90' }, 90],
  ['american75 free', { kind: 'american75', freeCenter: true }, 75],
  ['american75 on 90 items', { kind: 'american75', freeCenter: false }, 90],
  [
    'custom 4x6 random',
    {
      kind: 'custom',
      rows: 4,
      cols: 6,
      perRow: 3,
      maxPerColumn: 4,
      columnOrder: false,
      freeCenter: false,
    },
    40,
  ],
  [
    'custom 3x7 ordered',
    {
      kind: 'custom',
      rows: 3,
      cols: 7,
      perRow: 4,
      maxPerColumn: 2,
      columnOrder: true,
      freeCenter: false,
    },
    50,
  ],
  [
    'custom 3x3 free, one per row (free cell covers its column)',
    {
      kind: 'custom',
      rows: 3,
      cols: 3,
      perRow: 1,
      maxPerColumn: 3,
      columnOrder: false,
      freeCenter: true,
    },
    30,
  ],
  [
    'custom 9x9 tight (every column full but one cell)',
    {
      kind: 'custom',
      rows: 9,
      cols: 9,
      perRow: 8,
      maxPerColumn: 8,
      columnOrder: false,
      freeCenter: false,
    },
    90,
  ],
  [
    'custom 3x9 tight (every column with 2 items)',
    {
      kind: 'custom',
      rows: 3,
      cols: 9,
      perRow: 6,
      maxPerColumn: 2,
      columnOrder: true,
      freeCenter: false,
    },
    90,
  ],
  [
    'custom 5x5 free, unsorted columns',
    {
      kind: 'custom',
      rows: 5,
      cols: 5,
      perRow: 3,
      maxPerColumn: 3,
      columnOrder: true,
      sortColumns: false,
      freeCenter: true,
    },
    60,
  ],
  [
    'custom 3x3 free',
    {
      kind: 'custom',
      rows: 3,
      cols: 3,
      perRow: 3,
      maxPerColumn: 3,
      columnOrder: true,
      freeCenter: true,
    },
    30,
  ],
]

describe('generateBatch', () => {
  for (const [name, format, size] of FORMATS) {
    it(`produces valid, distinct cards for ${name}`, () => {
      const spec = gridSpecFor(format)
      const indices = range(size)
      for (let s = 0; s < 20; s++) {
        const cards = generateBatch({
          engine: ENGINE_VERSION,
          seed: `${name}-${s}`,
          spec,
          indices,
          count: 60,
        })
        expect(cards).toHaveLength(60)
        for (const card of cards) assertCardValid(card.cells, spec, indices)
        expect(new Set(cards.map((c) => cardSignature(c.cells))).size).toBe(60)
      }
    })
  }

  it('is deterministic and regenerates any card of a batch', () => {
    const spec = gridSpecFor({ kind: 'classic90' })
    const params = {
      engine: ENGINE_VERSION,
      seed: 'abc',
      spec,
      indices: range(90),
      firstNumber: 5,
    }
    const a = generateBatch({ ...params, count: 30 })
    const b = generateBatch({ ...params, count: 30 })
    expect(a).toEqual(b)
    expect(regenerateCard(params, 20)).toEqual(a[15])
    expect(regenerateCard(params, 4)).toBeNull()
  })

  it('keeps the classic look: 15 items, at most 2 per column', () => {
    const spec = gridSpecFor({ kind: 'classic90' })
    for (const card of generateBatch({
      engine: ENGINE_VERSION,
      seed: 'x',
      spec,
      indices: range(90),
      count: 500,
    })) {
      expect(card.cells.flat().filter((v) => v > 0)).toHaveLength(15)
    }
  })

  it('groups classic columns by tens', () => {
    const ranges = columnBuckets(range(90), 9, true).map((b) => [b[0], b.at(-1)])
    expect(ranges).toEqual([
      [1, 9],
      [10, 19],
      [20, 29],
      [30, 39],
      [40, 49],
      [50, 59],
      [60, 69],
      [70, 79],
      [80, 90],
    ])
    // Other sizes keep near-equal ranges.
    expect(columnBuckets(range(75), 5, true).map((b) => b.length)).toEqual([15, 15, 15, 15, 15])
  })

  it('does not sort 75-ball columns', () => {
    const spec = gridSpecFor({ kind: 'american75', freeCenter: false })
    const cards = generateBatch({
      engine: ENGINE_VERSION,
      seed: 'u',
      spec,
      indices: range(75),
      count: 50,
    })
    const sortedColumns = cards.flatMap((card) =>
      [0, 1, 2, 3, 4].filter((c) => {
        const column = card.cells.map((row) => row[c]!)
        return column.every((v, r) => r === 0 || v > column[r - 1]!)
      })
    )
    // 1 in 120 columns comes out sorted by chance.
    expect(sortedColumns.length).toBeLessThan(15)
  })

  it('fails clearly when there are not enough distinct cards', () => {
    const spec = gridSpecFor({
      kind: 'custom',
      rows: 2,
      cols: 2,
      perRow: 2,
      maxPerColumn: 2,
      columnOrder: false,
      freeCenter: false,
    })
    expect(() =>
      generateBatch({ engine: ENGINE_VERSION, seed: 's', spec, indices: range(5), count: 10 })
    ).toThrow(/distintos/)
  })

  it('rejects specs that need more items than the set has', () => {
    expect(
      validateSpec(gridSpecFor({ kind: 'american75', freeCenter: true }), 20).length
    ).toBeGreaterThan(0)
    expect(validateSpec(gridSpecFor({ kind: 'classic90' }), 90)).toEqual([])
  })
})

describe('card codes', () => {
  it('round-trips and tolerates typing variations', () => {
    expect(cardCode('K3F9', 42, 250)).toBe('K3F9-042')
    expect(cardCode('K3F9', 42, 1200)).toBe('K3F9-0042')
    expect(parseCardCode('k3f9-042')).toEqual({ batchId: 'K3F9', number: 42 })
    expect(parseCardCode(' K3F9 42 ')).toEqual({ batchId: 'K3F9', number: 42 })
    expect(parseCardCode('nope')).toBeNull()
  })
})

describe('checkCard', () => {
  it('detects lines and bingo', () => {
    const cells = [
      [1, 0, 21],
      [0, 12, FREE],
    ]
    expect(checkCard(cells, new Set([1])).hasLine).toBe(false)
    const line = checkCard(cells, new Set([1, 21]))
    expect(line.completeRows).toEqual([0])
    expect(line.hasBingo).toBe(false)
    const bingo = checkCard(cells, new Set([1, 21, 12]))
    expect(bingo.hasBingo).toBe(true)
    expect(bingo.marked[1]![2]).toBe(true)
  })
})

describe('imposition', () => {
  it('mirrors backs slot by slot, including on a partial last sheet', () => {
    const imp = computeImposition(100, 50, { ...DEFAULT_SHEET, orientation: 'portrait', margin: 5 })
    if ('error' in imp) throw new Error(imp.error)
    expect(imp.cols).toBe(2)
    for (const [i, front] of imp.fronts.entries()) {
      const back = imp.backs[i]!
      // Long-edge flip on portrait: x mirrors around the page centre, y stays.
      expect(back.x + 100).toBeCloseTo(imp.pageWidth - front.x)
      expect(back.y).toBeCloseTo(front.y)
    }
    const pages = planPages(imp.perPage + 3, imp, true)
    expect(pages.map((p) => p.side)).toEqual(['front', 'back', 'front', 'back'])
    expect(pages[3]!.cards.map((c) => c.slot)).toEqual(imp.backs.slice(0, 3))
  })

  it('mirrors rows for a short-edge flip on portrait pages', () => {
    const imp = computeImposition(100, 50, {
      ...DEFAULT_SHEET,
      orientation: 'portrait',
      flip: 'short',
    })
    if ('error' in imp) throw new Error(imp.error)
    for (const [i, front] of imp.fronts.entries()) {
      const back = imp.backs[i]!
      expect(back.x).toBeCloseTo(front.x)
      expect(back.y + 50).toBeCloseTo(imp.pageHeight - front.y)
    }
  })

  it('reports when nothing fits', () => {
    expect(computeImposition(300, 300, DEFAULT_SHEET)).toHaveProperty('error')
  })
})
