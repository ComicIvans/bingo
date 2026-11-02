// Parses a local set file: one item per line, "etiqueta;nombre" (comma and
// tab also work). The name is optional; without it the label is announced.

import type { BingoItem } from '#shared/types/bingo'

export const LOCAL_SET_MAX_ITEMS = 1000
// Same limits as the server's batch schema, so a local set can be registered.
export const LOCAL_LABEL_MAX = 60
export const LOCAL_NAME_MAX = 200
export const LOCAL_SET_NAME_MAX = 80

/** First `max` code points (never splits a surrogate pair). */
export function clip(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? chars.slice(0, max).join('').trim() : text
}

/** An item that the server accepts in a batch, or null when it has no label. */
export function localItem(index: number, label: string, name: string): BingoItem | null {
  const cleanLabel = clip(label.trim(), LOCAL_LABEL_MAX)
  if (!cleanLabel) return null
  return { index, label: cleanLabel, name: clip(name.trim(), LOCAL_NAME_MAX) || cleanLabel }
}

export interface ParsedItems {
  items: BingoItem[]
  /** Labels that appear more than once (allowed, but confusing on the cards). */
  duplicates: string[]
  /** Lines over the item limit that were left out. */
  truncated: number
  /** Labels or names cut to the maximum length. */
  shortened: number
}

function detectDelimiter(lines: string[]): string {
  // Semicolon first: it is what Spanish spreadsheets export and names often contain commas.
  for (const delimiter of [';', '\t', ','])
    if (lines.some((line) => splitLine(line, delimiter).length > 1)) return delimiter
  return ';'
}

/** Splits one CSV line, honouring double quotes ("a; b" stays one field). */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && !field.trim()) {
      field = ''
      quoted = true
    } else if (ch === delimiter) {
      fields.push(field)
      field = ''
    } else field += ch
  }
  fields.push(field)
  return fields.map((f) => f.trim())
}

const HEADER = /^(etiqueta|label|simbolo|símbolo|numero|número|elemento)$/i

/** Throws an Error with a Spanish message when the file has no usable items. */
export function parseItemsText(text: string): ParsedItems {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
  if (!lines.length) throw new Error('El archivo no contiene ningún elemento.')

  const delimiter = detectDelimiter(lines)
  const items: BingoItem[] = []
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  let truncated = 0
  let shortened = 0

  for (const [i, line] of lines.entries()) {
    const [label = '', ...rest] = splitLine(line, delimiter)
    if (i === 0 && HEADER.test(label)) continue
    if (!label) continue
    if (items.length >= LOCAL_SET_MAX_ITEMS) {
      truncated++
      continue
    }
    const name = rest.filter(Boolean).join(delimiter === '\t' ? ' ' : `${delimiter} `)
    const item = localItem(items.length + 1, label, name)
    if (!item) continue
    if (item.label !== label || (name && item.name !== name)) shortened++
    if (seen.has(item.label)) duplicates.add(item.label)
    seen.add(item.label)
    items.push(item)
  }
  if (!items.length) throw new Error('El archivo no contiene ningún elemento.')
  return { items, duplicates: [...duplicates], truncated, shortened }
}
