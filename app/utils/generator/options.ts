// Generator options other than the card design: set, format, batch and print
// settings. Saved in the browser next to the design.

import type { CardFormat } from '#shared/cards/grid'
import { DEFAULT_SHEET, type SheetOptions } from '#shared/cards/impose'
import { PAPER_PRESETS } from '#shared/cards/design'
import { randomCode } from '#shared/cards/random'
import type { BingoItem } from '#shared/types/bingo'
import { LOCAL_SET_MAX_ITEMS, LOCAL_SET_NAME_MAX, clip, localItem } from './csv'

export const OPTIONS_VERSION = 1

/** Value of the set picker for the set imported in this browser. */
export const LOCAL_SET_VALUE = '__local__'

export const COUNT_MIN = 1
export const COUNT_MAX = 2000
/** Card codes carry up to 6 digits (parseCardCode). */
export const LAST_NUMBER_MAX = 999_999

export const BATCH_ID_LENGTH = 4
export const SEED_LENGTH = 24

export type FormatKind = CardFormat['kind']

export interface CustomFormatOptions {
  rows: number
  cols: number
  perRow: number
  maxPerColumn: number
  columnOrder: boolean
  freeCenter: boolean
}

export interface GeneratorOptions {
  version: number
  /** Server set id, or LOCAL_SET_VALUE. */
  setId: string
  formatKind: FormatKind
  americanFreeCenter: boolean
  custom: CustomFormatOptions
  count: number
  firstNumber: number
  batchName: string
  batchId: string
  seed: string
  sheet: SheetOptions
  firstSheetOnly: boolean
  /** Last batch registered from this browser, so a re-download does not register it twice. */
  registered: { id: string; key: string } | null
}

/** Set imported from a local CSV/TXT file; it never leaves this browser. */
export interface LocalSet {
  name: string
  color: string
  items: BingoItem[]
}

export function newBatchId(): string {
  return randomCode(BATCH_ID_LENGTH)
}

export function newSeed(): string {
  return randomCode(SEED_LENGTH)
}

export function defaultOptions(): GeneratorOptions {
  return {
    version: OPTIONS_VERSION,
    setId: '',
    formatKind: 'classic90',
    americanFreeCenter: true,
    custom: { rows: 4, cols: 4, perRow: 4, maxPerColumn: 4, columnOrder: false, freeCenter: false },
    count: 20,
    firstNumber: 1,
    batchName: '',
    batchId: newBatchId(),
    seed: newSeed(),
    sheet: { ...DEFAULT_SHEET },
    firstSheetOnly: false,
    registered: null,
  }
}

export function formatFromOptions(options: GeneratorOptions): CardFormat {
  switch (options.formatKind) {
    case 'classic90':
      return { kind: 'classic90' }
    case 'american75':
      return { kind: 'american75', freeCenter: options.americanFreeCenter }
    case 'custom':
      return { kind: 'custom', ...options.custom }
  }
}

export function lastNumberOf(options: Pick<GeneratorOptions, 'firstNumber' | 'count'>): number {
  return options.firstNumber + options.count - 1
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(integer ? Math.round(value) : value, min, max)
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function code(value: unknown, length: number, fallback: () => string): string {
  return typeof value === 'string' && new RegExp(`^[0-9A-Z]{${length}}$`).test(value)
    ? value
    : fallback()
}

export function sanitizeSheet(raw: unknown, base: SheetOptions = DEFAULT_SHEET): SheetOptions {
  const value = isRecord(raw) ? raw : {}
  return {
    mode: value.mode === 'single' || value.mode === 'sheet' ? value.mode : base.mode,
    paperWidth: num(value.paperWidth, base.paperWidth, 50, 1000),
    paperHeight: num(value.paperHeight, base.paperHeight, 50, 1000),
    orientation:
      value.orientation === 'auto' ||
      value.orientation === 'portrait' ||
      value.orientation === 'landscape'
        ? value.orientation
        : base.orientation,
    margin: num(value.margin, base.margin, 0, 100),
    gap: num(value.gap, base.gap, 0, 100),
    flip: value.flip === 'long' || value.flip === 'short' ? value.flip : base.flip,
    cropMarks: bool(value.cropMarks, base.cropMarks),
  }
}

/** Options read from storage, with every missing or broken field reset. */
export function sanitizeOptions(raw: unknown): GeneratorOptions {
  const base = defaultOptions()
  if (!isRecord(raw)) return base
  const custom = isRecord(raw.custom) ? raw.custom : {}
  const count = num(raw.count, base.count, COUNT_MIN, COUNT_MAX, true)
  const registered =
    isRecord(raw.registered) &&
    typeof raw.registered.id === 'string' &&
    typeof raw.registered.key === 'string'
      ? { id: raw.registered.id, key: raw.registered.key }
      : null
  return {
    version: OPTIONS_VERSION,
    setId: typeof raw.setId === 'string' ? raw.setId : base.setId,
    formatKind:
      raw.formatKind === 'classic90' ||
      raw.formatKind === 'american75' ||
      raw.formatKind === 'custom'
        ? raw.formatKind
        : base.formatKind,
    americanFreeCenter: bool(raw.americanFreeCenter, base.americanFreeCenter),
    custom: {
      rows: num(custom.rows, base.custom.rows, 1, 12, true),
      cols: num(custom.cols, base.custom.cols, 1, 12, true),
      perRow: num(custom.perRow, base.custom.perRow, 1, 12, true),
      maxPerColumn: num(custom.maxPerColumn, base.custom.maxPerColumn, 1, 12, true),
      columnOrder: bool(custom.columnOrder, base.custom.columnOrder),
      freeCenter: bool(custom.freeCenter, base.custom.freeCenter),
    },
    count,
    firstNumber: num(raw.firstNumber, base.firstNumber, 1, LAST_NUMBER_MAX - count + 1, true),
    batchName: typeof raw.batchName === 'string' ? raw.batchName.slice(0, 120) : '',
    batchId: code(raw.batchId, BATCH_ID_LENGTH, newBatchId),
    seed: code(raw.seed, SEED_LENGTH, newSeed),
    sheet: sanitizeSheet(raw.sheet),
    firstSheetOnly: bool(raw.firstSheetOnly, false),
    registered,
  }
}

export function sanitizeLocalSet(raw: unknown): LocalSet | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null
  const items: BingoItem[] = []
  for (const value of raw.items) {
    if (items.length >= LOCAL_SET_MAX_ITEMS) break
    if (!isRecord(value) || typeof value.label !== 'string') continue
    const item = localItem(
      items.length + 1,
      value.label,
      typeof value.name === 'string' ? value.name : ''
    )
    if (item) items.push(item)
  }
  if (!items.length) return null
  const name = typeof raw.name === 'string' ? clip(raw.name.trim(), LOCAL_SET_NAME_MAX) : ''
  return {
    name: name || 'Conjunto propio',
    color:
      typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#ff6b6b',
    items,
  }
}

/** Preset id matching a size (in either orientation for paper), or 'custom'. */
export function matchPreset(
  presets: { id: string; width: number; height: number }[],
  width: number,
  height: number,
  rotated = false
): string {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.05
  const hit = presets.find(
    (p) =>
      (close(p.width, width) && close(p.height, height)) ||
      (rotated && close(p.width, height) && close(p.height, width))
  )
  return hit?.id ?? 'custom'
}

export function paperPresetId(sheet: SheetOptions): string {
  return matchPreset(PAPER_PRESETS, sheet.paperWidth, sheet.paperHeight, true)
}
