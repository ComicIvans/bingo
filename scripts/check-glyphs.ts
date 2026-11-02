// Checks that every label of every built-in set can be drawn by at least one
// font of the fallback chain, and reports which font draws each codepoint.
// Usage: node scripts/check-glyphs.ts [primaryFontId]

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { BUILTIN_SETS } from '../shared/data/builtin-sets.ts'
import { FALLBACK_FONT_IDS } from '../shared/fonts.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const primary = process.argv[2] ?? 'montserrat-700'
const chain = [primary, ...FALLBACK_FONT_IDS]
const fonts = chain.map((id) => ({
  id,
  font: fontkit.create(readFileSync(join(root, 'public', 'fonts', `${id}.ttf`))),
}))

let missing = 0
const byFont = new Map<string, Set<string>>()
for (const set of BUILTIN_SETS) {
  for (const item of set.items) {
    for (const ch of item.label) {
      const cp = ch.codePointAt(0)!
      const hit = fonts.find((f) => f.font.hasGlyphForCodePoint(cp))
      if (!hit) {
        missing++
        console.log(`MISSING ${set.id} #${item.index} ${JSON.stringify(ch)} U+${cp.toString(16)}`)
        continue
      }
      if (!byFont.has(hit.id)) byFont.set(hit.id, new Set())
      byFont.get(hit.id)!.add(ch)
    }
  }
}
for (const [id, chars] of byFont) console.log(`${id}: ${[...chars].join(' ')}`)
console.log(missing ? `${missing} missing glyphs` : 'All glyphs covered')
process.exit(missing ? 1 : 0)
