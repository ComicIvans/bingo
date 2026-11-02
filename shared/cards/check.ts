// Checks a card against the items drawn so far.

import { FREE, type CardCells } from './grid.ts'

export interface CardCheck {
  /** Same shape as the card: true where the cell is drawn or free. */
  marked: boolean[][]
  /** Rows (0-based) whose items have all been drawn. */
  completeRows: number[]
  /** Items on the card. */
  total: number
  /** Items on the card already drawn. */
  hits: number
  /** Item indices on the card not drawn yet. */
  missing: number[]
  hasLine: boolean
  hasBingo: boolean
}

export function checkCard(cells: CardCells, drawn: ReadonlySet<number>): CardCheck {
  const marked = cells.map((row) => row.map((v) => v === FREE || (v > 0 && drawn.has(v))))
  const completeRows: number[] = []
  const missing: number[] = []
  let total = 0
  let hits = 0
  cells.forEach((row, r) => {
    let rowItems = 0
    let rowHits = 0
    row.forEach((v) => {
      if (v <= 0) return
      total++
      rowItems++
      if (drawn.has(v)) {
        hits++
        rowHits++
      } else missing.push(v)
    })
    if (rowItems > 0 && rowHits === rowItems) completeRows.push(r)
  })
  return {
    marked,
    completeRows,
    total,
    hits,
    missing,
    hasLine: completeRows.length > 0,
    hasBingo: total > 0 && hits === total,
  }
}
