// Downloads the static TTF instances listed in shared/fonts.ts into
// public/fonts, plus each family's licence into public/fonts/licenses.
//
// Google Fonts serves TTF (instead of WOFF/WOFF2) to user agents it does not
// recognise, and each weight comes as its own static file.
//
// Usage: pnpm fonts:fetch [--force]

import { mkdir, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { FONT_FAMILIES, fontId, fontSlug } from '../shared/fonts.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const fontsDir = join(root, 'public', 'fonts')
const licensesDir = join(fontsDir, 'licenses')
const force = process.argv.includes('--force')
const UA = 'Wget/1.21'

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function fetchOk(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res
}

function cssUrl(family, weights) {
  const name = family.replace(/ /g, '+')
  const axis = weights.length === 1 && weights[0] === 400 ? '' : `:wght@${weights.join(';')}`
  return `https://fonts.googleapis.com/css2?family=${name}${axis}`
}

async function fetchFamily({ family, weights }) {
  const css = await (
    await fetchOk(cssUrl(family, weights), { headers: { 'User-Agent': UA } })
  ).text()
  const blocks = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1])
  for (const weight of weights) {
    const block = blocks.find(
      (b) => new RegExp(`font-weight:\\s*${weight};`).test(b) && /font-style:\s*normal/.test(b)
    )
    const url = block?.match(/url\(([^)]+\.ttf)\)/)?.[1]
    if (!url) throw new Error(`No TTF for ${family} ${weight}`)
    const target = join(fontsDir, `${fontId(family, weight)}.ttf`)
    if (!force && (await exists(target))) continue
    const bytes = new Uint8Array(await (await fetchOk(url)).arrayBuffer())
    await writeFile(target, bytes)
    console.log(`  ${fontId(family, weight)}.ttf (${Math.round(bytes.length / 1024)} KB)`)
  }
}

async function fetchLicense({ family }) {
  const target = join(licensesDir, `${fontSlug(family)}.txt`)
  if (!force && (await exists(target))) return
  const dir = family.toLowerCase().replace(/ /g, '')
  const candidates = [
    `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`,
    `https://raw.githubusercontent.com/google/fonts/main/apache/${dir}/LICENSE.txt`,
    `https://raw.githubusercontent.com/google/fonts/main/ufl/${dir}/UFL.txt`,
  ]
  for (const url of candidates) {
    const res = await fetch(url)
    if (res.ok) {
      await writeFile(target, await res.text())
      return
    }
  }
  console.warn(`  ! No licence found for ${family}`)
}

await mkdir(licensesDir, { recursive: true })
for (const family of FONT_FAMILIES) {
  console.log(family.family)
  await fetchFamily(family)
  await fetchLicense(family)
}
console.log('Done.')
