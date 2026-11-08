import { describe, expect, it } from 'vitest'
import { defaultBatchIds, type BatchInfo, type PastGame } from '../shared/cards/inPlay'

const batch = (id: string, setId: string, createdAt: string): BatchInfo => ({
  id,
  setId,
  createdAt,
})
const game = (setId: string, startedAt: string, batchIds: string[]): PastGame => ({
  setId,
  startedAt,
  batchIds,
})

describe('defaultBatchIds', () => {
  const batches = [
    batch('OLD1', 'numeros', '2025-11-08T10:00:00Z'),
    batch('AAAA', 'numeros', '2026-11-08T18:50:00Z'),
    batch('BBBB', 'numeros', '2026-11-08T18:51:00Z'),
    batch('OTRO', 'animales', '2026-11-08T18:52:00Z'),
  ]

  it('takes the newest print run of the set when it was never played', () => {
    expect(defaultBatchIds('numeros', batches, [])).toEqual(['BBBB', 'AAAA'])
  })

  it('keeps the batches of the previous game of the set (second game of the evening)', () => {
    const games = [game('numeros', '2026-11-08T19:00:00Z', ['AAAA', 'BBBB'])]
    expect(defaultBatchIds('numeros', batches, games)).toEqual(['BBBB', 'AAAA'])
  })

  it('adds batches made since the previous game', () => {
    const more = [...batches, batch('CCCC', 'numeros', '2026-11-08T20:00:00Z')]
    const games = [game('numeros', '2026-11-08T19:00:00Z', ['AAAA'])]
    expect(defaultBatchIds('numeros', more, games)).toEqual(['CCCC', 'AAAA'])
  })

  it('falls back to the newest print run when the previous game listed none', () => {
    const games = [game('numeros', '2026-11-08T19:00:00Z', [])]
    expect(defaultBatchIds('numeros', batches, games)).toEqual(['BBBB', 'AAAA'])
  })

  it('only offers batches of the set and ignores games of other sets', () => {
    const games = [game('animales', '2026-11-08T19:00:00Z', ['OTRO'])]
    expect(defaultBatchIds('animales', batches, games)).toEqual(['OTRO'])
    expect(defaultBatchIds('colores', batches, games)).toEqual([])
  })
})
