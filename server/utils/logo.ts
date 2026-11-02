export const LOGO_MAX_BYTES = 2 * 1024 * 1024

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b)

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

/**
 * Type of an uploaded logo from its content (never from the file name or
 * the declared type), or null when it is not a PNG, JPEG, WebP or SVG.
 */
export function detectLogoType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  text = text.replace(/^\uFEFF/, '')
  if (text.includes('\0') || !/^\s*</.test(text)) return null
  return /<svg[\s>/]/i.test(text) ? 'image/svg+xml' : null
}

/** Default logo for a variant (the light one is drawn for dark backgrounds). */
export function defaultLogoPath(variant: 'dark' | 'light'): string {
  const base = useRuntimeConfig().app.baseURL.replace(/\/+$/, '')
  return `${base}/${variant === 'dark' ? 'LogoBingoClaro.svg' : 'LogoBingo.svg'}`
}
