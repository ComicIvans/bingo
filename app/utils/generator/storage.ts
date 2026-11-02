// localStorage access that never throws: private windows, blocked storage and
// a full quota (images and fonts are stored as data URLs) are all expected.

export const STORAGE_KEYS = {
  design: 'bingo:generator:design',
  options: 'bingo:generator:options',
  localSet: 'bingo:generator:local-set',
} as const

export type WriteResult = 'ok' | 'quota' | 'unavailable'

export function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  )
}

export function writeStorage(key: string, value: unknown): WriteResult {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return 'ok'
  } catch (error) {
    return isQuotaError(error) ? 'quota' : 'unavailable'
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
