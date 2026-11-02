import { SERVER_LOGO_ID, type CardDesign, type DesignImage } from '#shared/cards/design'
import { randomCode } from '#shared/cards/random'
import { removeImageFromDesign, serverLogoUrl } from '~/utils/generator/design'
import { baseName, bytesToDataUrl, dataUrlToBytes, formatBytes } from '~/utils/generator/files'
import { IMAGE_MIME, detectImageKind, measureImage, type ImageKind } from '~/utils/generator/images'

// Images of the design: uploads stored as data URLs, plus the logo set in
// the panel. The preview references them through blob: URLs so a large
// upload is not copied into every <image> of the sheet preview.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Logo used when the server cannot serve the panel logo. */
const DEFAULT_LOGO = '/LogoBingo.svg'

export interface ImageBytes {
  bytes: Uint8Array
  kind: ImageKind
}

const round = (n: number) => Math.round(n * 1000) / 1000

async function fetchBytes(src: string): Promise<Uint8Array> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

export function useImageLibrary(design: Ref<CardDesign>) {
  const blobUrls = new Map<string, { src: string; url: string }>()
  /** Bytes of remote images (the panel logo), by URL. */
  const remote = new Map<string, Uint8Array>()
  /** The panel logo could not be loaded and the default one is shown instead. */
  const logoUnavailable = ref(false)

  /** URL to draw an image in the preview. */
  function href(imageId: string): string | undefined {
    const image = design.value.images[imageId]
    if (!image) return undefined
    if (!image.src.startsWith('data:')) return image.src
    const hit = blobUrls.get(imageId)
    if (hit?.src === image.src) return hit.url
    if (hit) URL.revokeObjectURL(hit.url)
    const { bytes, mime } = dataUrlToBytes(image.src)
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
    blobUrls.set(imageId, { src: image.src, url })
    return url
  }

  /** Adds an uploaded image and returns its id. Throws with a Spanish message. */
  async function add(file: File): Promise<string> {
    if (file.size > MAX_IMAGE_BYTES)
      throw new Error(
        `La imagen ocupa ${formatBytes(file.size)} y el máximo es ${formatBytes(MAX_IMAGE_BYTES)}.`
      )
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = detectImageKind(bytes)
    if (!kind || kind === 'gif') throw new Error('Formato no admitido. Usa PNG, JPEG, SVG o WebP.')
    const size = await measureImage(bytes, kind).catch(() => {
      throw new Error('No se pudo leer la imagen. Comprueba que el archivo no esté dañado.')
    })
    const id = `img-${randomCode(6).toLowerCase()}`
    design.value.images[id] = {
      name: baseName(file.name) || 'Imagen',
      src: bytesToDataUrl(bytes, IMAGE_MIME[kind]),
      width: round(size.width),
      height: round(size.height),
    }
    return id
  }

  function remove(imageId: string): void {
    if (imageId === SERVER_LOGO_ID) return
    removeImageFromDesign(design.value, imageId)
    const hit = blobUrls.get(imageId)
    if (hit) URL.revokeObjectURL(hit.url)
    blobUrls.delete(imageId)
  }

  /** Bytes and real format of an image, for the PDF. */
  async function read(image: DesignImage): Promise<ImageBytes | null> {
    let bytes: Uint8Array
    if (image.src.startsWith('data:')) bytes = dataUrlToBytes(image.src).bytes
    else {
      bytes = remote.get(image.src) ?? (await fetchBytes(image.src))
      remote.set(image.src, bytes)
    }
    const kind = detectImageKind(bytes)
    return kind ? { bytes, kind } : null
  }

  /**
   * Points the logo image at the panel logo (light variant) and refreshes its
   * size, so the layout keeps the real aspect ratio.
   */
  async function syncLogo(logoVersion: number): Promise<void> {
    const images = design.value.images
    const url = serverLogoUrl(logoVersion)
    const current = images[SERVER_LOGO_ID]
    images[SERVER_LOGO_ID] = {
      name: 'Logo del panel',
      src: url,
      width: current?.width || 330,
      height: current?.height || 104,
    }
    for (const src of [url, DEFAULT_LOGO]) {
      try {
        const bytes = remote.get(src) ?? (await fetchBytes(src))
        const kind = detectImageKind(bytes)
        if (!kind) continue
        remote.set(src, bytes)
        const size = await measureImage(bytes, kind)
        const logo = design.value.images[SERVER_LOGO_ID]
        if (!logo) return
        logo.src = src
        if (round(size.width) !== logo.width) logo.width = round(size.width)
        if (round(size.height) !== logo.height) logo.height = round(size.height)
        logoUnavailable.value = src !== url
        return
      } catch {
        // Try the bundled default logo next.
      }
    }
    logoUnavailable.value = true
  }

  function dispose(): void {
    for (const { url } of blobUrls.values()) URL.revokeObjectURL(url)
    blobUrls.clear()
  }

  return { href, add, remove, read, syncLogo, logoUnavailable, dispose }
}

export type ImageLibrary = ReturnType<typeof useImageLibrary>
