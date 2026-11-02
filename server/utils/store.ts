import { DEFAULT_SETTINGS } from '#shared/types/api'
import type { Announcement, CardBatch, GameRecord, Settings } from '#shared/types/api'
import type { BingoSet } from '#shared/types/bingo'

// Typed access to the 'bingo' mount (server/plugins/storage.ts). Keys:
//   settings               Settings
//   live:current           { gameId } of the game on the live screens
//   live:announcement      Announcement | null
//   live:version           last LiveState version
//   games:<id>             GameRecord (running and finished)
//   sets:<id>              custom BingoSet
//   batches:<id>           CardBatch
//   branding:logo          raw logo bytes
//   branding:logo-meta     LogoMeta

export type LogoType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'

export interface LogoMeta {
  type: LogoType
  size: number
  updatedAt: string
}

const bingoStorage = () => useStorage('bingo')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readRecord<T>(key: string): Promise<T | null> {
  const value = await bingoStorage().getItem(key)
  return isRecord(value) ? (value as T) : null
}

async function readAll<T>(prefix: string): Promise<T[]> {
  const storage = bingoStorage()
  const keys = await storage.getKeys(prefix)
  const values = await Promise.all(keys.map((key) => storage.getItem(key)))
  return values.filter(isRecord) as T[]
}

// ─── Settings ──────────────────────────────────────────────────────────────

export async function readSettings(): Promise<Settings> {
  const stored = await readRecord<Partial<Settings>>('settings')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function writeSettings(settings: Settings) {
  await bingoStorage().setItem('settings', settings)
}

// ─── Live pointers ─────────────────────────────────────────────────────────

export async function readCurrentGameId(): Promise<string | null> {
  const stored = await readRecord<{ gameId?: unknown }>('live:current')
  return typeof stored?.gameId === 'string' ? stored.gameId : null
}

export async function writeCurrentGameId(gameId: string | null) {
  await bingoStorage().setItem('live:current', { gameId })
}

export async function readAnnouncement(): Promise<Announcement | null> {
  const stored = await readRecord<Announcement>('live:announcement')
  return typeof stored?.id === 'string' && typeof stored.kind === 'string' ? stored : null
}

export async function writeAnnouncement(announcement: Announcement | null) {
  if (announcement) await bingoStorage().setItem('live:announcement', announcement)
  else await bingoStorage().removeItem('live:announcement')
}

export async function readStoredVersion(): Promise<number | null> {
  const value = await bingoStorage().getItem('live:version')
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function writeStoredVersion(version: number) {
  await bingoStorage().setItem('live:version', version)
}

// ─── Games ─────────────────────────────────────────────────────────────────

export async function readGame(id: string): Promise<GameRecord | null> {
  return readRecord<GameRecord>(`games:${id}`)
}

export async function writeGame(game: GameRecord) {
  await bingoStorage().setItem(`games:${game.id}`, game)
}

export async function removeGame(id: string) {
  await bingoStorage().removeItem(`games:${id}`)
}

export async function readAllGames(): Promise<GameRecord[]> {
  return readAll<GameRecord>('games')
}

// ─── Custom sets ───────────────────────────────────────────────────────────

export async function readCustomSet(id: string): Promise<BingoSet | null> {
  const set = await readRecord<BingoSet>(`sets:${id}`)
  return set ? { ...set, builtin: false } : null
}

export async function writeCustomSet(set: BingoSet) {
  await bingoStorage().setItem(`sets:${set.id}`, { ...set, builtin: false })
}

export async function removeCustomSet(id: string) {
  await bingoStorage().removeItem(`sets:${id}`)
}

export async function readAllCustomSets(): Promise<BingoSet[]> {
  const sets = await readAll<BingoSet>('sets')
  return sets.map((set) => ({ ...set, builtin: false }))
}

// ─── Card batches ──────────────────────────────────────────────────────────

export async function readBatch(id: string): Promise<CardBatch | null> {
  return readRecord<CardBatch>(`batches:${id}`)
}

export async function writeBatch(batch: CardBatch) {
  await bingoStorage().setItem(`batches:${batch.id}`, batch)
}

export async function removeBatch(id: string) {
  await bingoStorage().removeItem(`batches:${id}`)
}

export async function readAllBatches(): Promise<CardBatch[]> {
  return readAll<CardBatch>('batches')
}

// ─── Logo ──────────────────────────────────────────────────────────────────

export async function readLogo(): Promise<{ bytes: Uint8Array; meta: LogoMeta } | null> {
  const storage = bingoStorage()
  const meta = await readRecord<LogoMeta>('branding:logo-meta')
  if (!meta) return null
  const raw = await storage.getItemRaw('branding:logo')
  if (!(raw instanceof Uint8Array) || raw.byteLength === 0) return null
  return { bytes: raw, meta }
}

export async function writeLogo(bytes: Uint8Array, type: LogoType) {
  const storage = bingoStorage()
  await storage.setItemRaw('branding:logo', bytes)
  const meta: LogoMeta = { type, size: bytes.byteLength, updatedAt: new Date().toISOString() }
  await storage.setItem('branding:logo-meta', meta)
}

export async function removeLogo() {
  const storage = bingoStorage()
  await storage.removeItem('branding:logo-meta')
  await storage.removeItem('branding:logo')
}
