// Domain types shared by the server, the live views and the card generator.

/** What the public screen shows when an item is drawn. */
export type PublicDisplay = 'label' | 'name' | 'both'

export interface BingoItem {
  /** 1-based position. Fixes the item's column on the cards and its place on the board. */
  index: number
  /** Short text printed on the cards (e.g. `42`, `H`, `∫`). */
  label: string
  /** Long name announced on the public screen (e.g. `Cuarenta y dos`, `Hidrógeno`). */
  name: string
}

export interface BingoSet {
  /** URL-safe id (`numeros`, `tabla-periodica`, ...). */
  id: string
  name: string
  description?: string
  /** Accent colour used by the board and as the default card colour. */
  color: string
  /** Default public display for games played with this set. */
  publicDisplay: PublicDisplay
  /** Built-in sets ship with the app and cannot be edited or deleted. */
  builtin: boolean
  items: BingoItem[]
}

/** Lightweight listing entry for `GET /api/sets`. */
export interface BingoSetSummary {
  id: string
  name: string
  description?: string
  color: string
  publicDisplay: PublicDisplay
  builtin: boolean
  size: number
}
