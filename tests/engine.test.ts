import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSIONS, generateBatch, gridSpecFor, type CardFormat } from '../shared/cards/grid'

// Frozen output of every generator version. The server checks a printed card
// by generating it again from its batch, so what a version generates must
// never change: if one of these hashes fails, cards already printed with that
// version would no longer match. Change the algorithm in a new version instead
// (ENGINE_VERSION in shared/cards/grid.ts) and add its hashes here.

interface GoldenCase {
  format: CardFormat
  setSize: number
  count: number
  firstNumber?: number
  /** Item indices in reverse order (cards without column order depend on it). */
  reversed?: boolean
}

const custom = (
  rows: number,
  cols: number,
  perRow: number,
  maxPerColumn: number,
  columnOrder: boolean,
  freeCenter: boolean
): CardFormat => ({ kind: 'custom', rows, cols, perRow, maxPerColumn, columnOrder, freeCenter })

const GOLDEN_CASES: Record<string, GoldenCase> = {
  classic90: { format: { kind: 'classic90' }, setSize: 90, count: 300 },
  'american75-free': { format: { kind: 'american75', freeCenter: true }, setSize: 75, count: 300 },
  'american75-90': {
    format: { kind: 'american75', freeCenter: false },
    setSize: 90,
    count: 200,
    firstNumber: 41,
  },
  'custom-3x7-uneven': { format: custom(3, 7, 4, 2, true, false), setSize: 50, count: 200 },
  'custom-4x6-random': {
    format: custom(4, 6, 3, 4, false, false),
    setSize: 40,
    count: 200,
    reversed: true,
  },
  'custom-3x3-free-1': { format: custom(3, 3, 1, 3, false, true), setSize: 30, count: 100 },
  'custom-3x3-free-3': { format: custom(3, 3, 3, 3, true, true), setSize: 30, count: 100 },
  'custom-3x9-tight': { format: custom(3, 9, 6, 2, true, false), setSize: 90, count: 200 },
  'custom-2x2-all': { format: custom(2, 2, 2, 2, false, false), setSize: 5, count: 5 },
}

function goldenHash(engine: number, name: string): string {
  const c = GOLDEN_CASES[name]!
  const indices = Array.from({ length: c.setSize }, (_, i) => i + 1)
  if (c.reversed) indices.reverse()
  const cards = generateBatch({
    engine,
    seed: `golden-${name}-0123456789`,
    spec: gridSpecFor(c.format),
    indices,
    count: c.count,
    firstNumber: c.firstNumber,
  })
  return createHash('sha256')
    .update(JSON.stringify(cards.map((card) => [card.number, card.cells])))
    .digest('hex')
    .slice(0, 16)
}

const GOLDEN: Record<number, Record<string, string>> = {
  1: {
    classic90: '64b28d0c180a52e7',
    'american75-free': 'f7f46838bdb72183',
    'american75-90': '92f63dfbe8c2a9d8',
    'custom-3x7-uneven': '7d5cf656e7dd7d6c',
    'custom-4x6-random': '6cc29bf5e8e1c958',
    'custom-3x3-free-1': 'a2801e8f592c7449',
    'custom-3x3-free-3': 'f2e70c24b5da7e8d',
    'custom-3x9-tight': '2f088c4f27bb6039',
    'custom-2x2-all': 'f5b3f97f870fa1db',
  },
}

describe('generator versions', () => {
  it('has frozen hashes for every version', () => {
    expect(Object.keys(GOLDEN).map(Number)).toEqual([...ENGINE_VERSIONS])
  })

  for (const engine of ENGINE_VERSIONS)
    for (const name of Object.keys(GOLDEN_CASES))
      it(`v${engine} still generates the same ${name} cards`, () => {
        expect(goldenHash(engine, name)).toBe(GOLDEN[engine]![name])
      })

  it('v1 still generates the same first classic card', () => {
    const [card] = generateBatch({
      engine: 1,
      seed: 'golden-classic90-0123456789',
      spec: gridSpecFor({ kind: 'classic90' }),
      indices: Array.from({ length: 90 }, (_, i) => i + 1),
      count: 1,
    })
    expect(card!.cells).toEqual([
      [1, 17, 0, 36, 0, 54, 0, 72, 0],
      [3, 0, 25, 0, 49, 0, 68, 0, 83],
      [0, 0, 0, 39, 0, 60, 70, 77, 87],
    ])
  })
})
