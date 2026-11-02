// Images in the browser: type detection, intrinsic size, and rasterising
// SVG/WebP/GIF to PNG for the PDF (pdf-lib only embeds PNG and JPEG).

import type { DrawOp } from '#shared/cards/layout'

export type ImageKind = 'png' | 'jpg' | 'gif' | 'webp' | 'svg'

export const IMAGE_MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp'

/** Print resolution for rasterised images, and a cap so huge cards stay manageable. */
const TARGET_DPI = 300
const MAX_SIDE_PX = 3000

/** Detects the format from the first bytes (URLs and MIME types can lie, e.g. redirects). */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  const b = bytes
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'webp'
  const head = new TextDecoder()
    .decode(b.subarray(0, 2048))
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'svg'
  return null
}

const UNIT_PX: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
}

function parseLength(value: string | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?$/i)
  if (!match) return null
  const n = Number(match[1]) * UNIT_PX[(match[2] ?? '').toLowerCase()]!
  return n > 0 && Number.isFinite(n) ? n : null
}

function rootTag(svg: string): { tag: string; start: number } | null {
  const match = /<svg\b[^>]*>/i.exec(svg)
  return match ? { tag: match[0], start: match.index } : null
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return match ? (match[2] ?? match[3]) : undefined
}

function viewBoxOf(tag: string): [number, number, number, number] | null {
  const raw = attr(tag, 'viewBox')
  if (!raw) return null
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isFinite(p)) ||
    parts[2]! <= 0 ||
    parts[3]! <= 0
  )
    return null
  return parts as [number, number, number, number]
}

/** Intrinsic size of an SVG in px, from width/height or the viewBox. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const root = rootTag(svg)
  if (!root) return null
  const width = parseLength(attr(root.tag, 'width'))
  const height = parseLength(attr(root.tag, 'height'))
  const box = viewBoxOf(root.tag)
  if (width && height) return { width, height }
  if (box) {
    const aspect = box[2] / box[3]
    if (width) return { width, height: width / aspect }
    if (height) return { width: height * aspect, height }
    return { width: box[2], height: box[3] }
  }
  return null
}

/**
 * Same SVG with an explicit pixel size (Firefox will not draw an SVG without
 * one into a canvas). Adds a viewBox when missing so the drawing scales.
 */
export function svgWithPixelSize(svg: string, width: number, height: number): string {
  const root = rootTag(svg)
  if (!root) return svg
  const natural = svgSize(svg)
  let tag = root.tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')
  if (!viewBoxOf(root.tag) && natural)
    tag = tag.replace(/^<svg/i, `<svg viewBox="0 0 ${natural.width} ${natural.height}"`)
  tag = tag.replace(/^<svg/i, `<svg width="${width}" height="${height}"`)
  return svg.slice(0, root.start) + tag + svg.slice(root.start + root.tag.length)
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = src
  })
}

function blobOf(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type })
}

/** Intrinsic size in px of an image given its bytes. */
export async function measureImage(
  bytes: Uint8Array,
  kind: ImageKind
): Promise<{ width: number; height: number }> {
  if (kind === 'svg') {
    const size = svgSize(new TextDecoder().decode(bytes))
    if (size) return size
  }
  const url = URL.createObjectURL(blobOf(bytes, IMAGE_MIME[kind]))
  try {
    const img = await loadImageElement(url)
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('La imagen no tiene tamaño.')
    return { width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Pixel size for an image drawn `boxWidthMm` wide: at least 300 dpi for
 * vectors, never upscaling bitmaps, and at most 3000 px per side.
 */
export function rasterSize(
  boxWidthMm: number,
  aspect: number,
  natural: { width: number; height: number } | null
): { width: number; height: number } {
  let width = Math.ceil((boxWidthMm / 25.4) * TARGET_DPI)
  if (natural) width = Math.min(width, Math.round(natural.width))
  let height = width / aspect
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(width, height))
  width = Math.max(1, Math.round(width * scale))
  height = Math.max(1, Math.round(height * scale))
  return { width, height }
}

/**
 * Draws any image the browser can decode at the given size, as PNG or JPEG.
 * The browser applies EXIF orientation while drawing.
 */
export async function rasterize(
  bytes: Uint8Array,
  kind: ImageKind,
  width: number,
  height: number,
  output: 'png' | 'jpg' = 'png'
): Promise<Uint8Array> {
  const blob =
    kind === 'svg'
      ? new Blob([svgWithPixelSize(new TextDecoder().decode(bytes), width, height)], {
          type: IMAGE_MIME.svg,
        })
      : blobOf(bytes, IMAGE_MIME[kind])
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImageElement(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no permite dibujar la imagen.')
    if (output === 'jpg') {
      // JPEG has no transparency; paint white like the paper.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)
    const result = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('No se pudo convertir la imagen.'))),
        IMAGE_MIME[output],
        0.92
      )
    )
    return new Uint8Array(await result.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** EXIF orientation of a JPEG (1 when absent or unreadable). */
export function jpegOrientation(bytes: Uint8Array): number {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint16(0) !== 0xffd8) return 1
    let pos = 2
    while (pos + 4 <= view.byteLength) {
      const marker = view.getUint16(pos)
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1
      const length = view.getUint16(pos + 2)
      // APP1 segment with the Exif header.
      if (
        marker === 0xffe1 &&
        view.getUint32(pos + 4) === 0x45786966 &&
        view.getUint16(pos + 8) === 0
      ) {
        const tiff = pos + 10
        const little = view.getUint16(tiff) === 0x4949
        const ifd = tiff + view.getUint32(tiff + 4, little)
        const entries = view.getUint16(ifd, little)
        for (let i = 0; i < entries; i++) {
          const entry = ifd + 2 + i * 12
          if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little)
        }
        return 1
      }
      pos += 2 + length
    }
  } catch {
    // Truncated or malformed metadata: treat as upright.
  }
  return 1
}

/** Largest width (mm) each image is drawn at in some display lists. */
export function imageDrawWidths(...lists: DrawOp[][]): Map<string, number> {
  const widths = new Map<string, number>()
  for (const ops of lists)
    for (const op of ops)
      if (op.op === 'image') widths.set(op.imageId, Math.max(widths.get(op.imageId) ?? 0, op.w))
  return widths
}
