// Messages between the generator page and the PDF worker.

import type { CardDesign } from '#shared/cards/design'
import type { GridSpec } from '#shared/cards/grid'
import type { SheetOptions } from '#shared/cards/impose'
import type { PdfImageAsset } from '#shared/cards/pdf'

export interface PdfJobRequest {
  design: CardDesign
  spec: GridSpec
  seed: string
  /** Item indices of the set, in order. */
  indices: number[]
  /** [index, label] of every item (the grid font size depends on all of them). */
  labels: [number, string][]
  batchId: string
  firstNumber: number
  /** Cards in this PDF: the whole batch, or the first sheet for a test print. */
  count: number
  /** Last number of the whole batch; fixes the digits of every code. */
  lastNumber: number
  sheet: SheetOptions
  title: string
  /**
   * Bytes of exactly the fonts the preview engine holds, so text lands on the
   * same fonts in the PDF as on screen.
   */
  fonts: [string, ArrayBuffer][]
  images: [string, PdfImageAsset][]
}

export type PdfJobPhase = 'cards' | 'pages'

export type PdfWorkerMessage =
  | { type: 'progress'; phase: PdfJobPhase; done: number; total: number }
  | { type: 'done'; pdf: Uint8Array }
  | { type: 'error'; message: string }
