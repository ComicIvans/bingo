// Contracts between the server and the app: stored records, API payloads and
// the live state pushed to the public screen, the board and the panel.
//
// ─── Routes ────────────────────────────────────────────────────────────────
// (admin) = needs the panel session cookie; answers 401 without it.
//
// Auth
//   POST   /api/auth/login            { key }                → 204 | 401 | 429
//   POST   /api/auth/logout                                   → 204
//   GET    /api/auth/session                                  → SessionInfo
//
// Live game
//   GET    /api/live                                          → LiveState
//   GET    /api/live/stream   Server-Sent Events: `event: state` with a full
//                             LiveState as JSON on connect and after every
//                             change; `event: ping` every 20 s.
//   POST   /api/game/start    (admin) StartGameBody           → LiveState  (409 if a game is running and !force)
//   PATCH  /api/game          (admin) UpdateGameBody          → LiveState
//   POST   /api/game/draw     (admin) DrawBody                → DrawResult (409 when no game, all drawn, or index already drawn)
//   POST   /api/game/undo     (admin)                         → LiveState  (removes the last draw)
//   POST   /api/game/announce (admin) AnnounceBody            → LiveState
//   DELETE /api/game/announce (admin)                         → LiveState  (hides the announcement)
//   POST   /api/game/finish   (admin)                         → LiveState
//
// History
//   GET    /api/history       (admin)                         → GameSummary[] (newest first)
//   GET    /api/history/:id   (admin)                         → GameRecord
//   DELETE /api/history/:id   (admin)                         → 204 (409 for the running game)
//
// Sets
//   GET    /api/sets                                          → BingoSetSummary[] (built-in first)
//   GET    /api/sets/:id                                      → BingoSet
//   POST   /api/sets          (admin) SetBody                 → BingoSet
//   PUT    /api/sets/:id      (admin) SetBody                 → BingoSet   (403 for built-in sets)
//   DELETE /api/sets/:id      (admin)                         → 204        (403 for built-in sets)
//
// Settings and branding
//   GET    /api/settings                                      → Settings
//   PUT    /api/settings      (admin) Partial<SettingsBody>   → Settings
//   GET    /api/branding/logo?variant=dark|light&v=<logoVersion>
//                             → the uploaded logo, or a redirect to the
//                               default (/LogoBingoClaro.svg on dark,
//                               /LogoBingo.svg on light)
//   POST   /api/branding/logo (admin) multipart field `file`  → Settings  (PNG, JPEG, WebP or SVG, ≤ 2 MB)
//   DELETE /api/branding/logo (admin)                         → Settings  (back to the default logo)
//
// Card batches and checking
//   POST   /api/batches       (admin) RegisterBatchBody       → CardBatchSummary (409 if the id exists)
//   POST   /api/batches/import (admin) CardBatch (a batch file) → CardBatchSummary
//   GET    /api/batches       (admin)                         → CardBatchSummary[] (newest first)
//   DELETE /api/batches/:id   (admin)                         → 204
//   GET    /api/check?code=K3F9-042[&gameId=…] (admin)        → CardCheckResult
//                             Checks against the given game, or the current
//                             live game when omitted.
//
// Errors use h3's createError with a Spanish `statusMessage` the UI shows as is.

import type { BingoItem, PublicDisplay } from './bingo'
import type { CardFormat } from '../cards/grid'
import type { CardCheck } from '../cards/check'

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface SessionInfo {
  authenticated: boolean
  /** False when NUXT_ADMIN_KEY is not set (the panel cannot be used). */
  configured: boolean
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface Settings {
  /** Event name, shown on the public screen and suggested to the generator. */
  title: string
  /** Optional line under the title on the public screen. */
  subtitle: string
  publicTheme: 'dark' | 'light'
  /** Previous items listed on the public screen. */
  recentCount: number
  /** Bumped on every logo upload or reset, to bust caches. */
  logoVersion: number
  hasCustomLogo: boolean
}

export type SettingsBody = Pick<Settings, 'title' | 'subtitle' | 'publicTheme' | 'recentCount'>

export const DEFAULT_SETTINGS: Settings = {
  title: 'Bingo',
  subtitle: '',
  publicTheme: 'dark',
  recentCount: 8,
  logoVersion: 0,
  hasCustomLogo: false,
}

// ─── Games ─────────────────────────────────────────────────────────────────

export interface GameDraw {
  index: number
  /** ISO timestamp. */
  at: string
}

export type AnnouncementKind = 'line' | 'bingo' | 'message'

export interface Announcement {
  id: string
  kind: AnnouncementKind
  /** Free text for `message`; optional note otherwise. */
  text?: string
  /** Winning card, when the panel checked one. */
  cardCode?: string
  at: string
}

export interface GameRecord {
  id: string
  name: string
  /** Snapshot of the set when the game started, so history survives set edits. */
  set: { id: string; name: string; color: string; items: BingoItem[] }
  publicDisplay: PublicDisplay
  status: 'running' | 'finished'
  startedAt: string
  finishedAt: string | null
  draws: GameDraw[]
  /** Every announcement made during the game (also the winners log). */
  announcements: Announcement[]
}

export interface GameSummary {
  id: string
  name: string
  setId: string
  setName: string
  color: string
  status: 'running' | 'finished'
  startedAt: string
  finishedAt: string | null
  drawCount: number
  total: number
  lines: number
  bingos: number
}

export interface StartGameBody {
  name: string
  setId: string
  /** Defaults to the set's publicDisplay. */
  publicDisplay?: PublicDisplay
  /** Finish the running game first instead of answering 409. */
  force?: boolean
}

export interface UpdateGameBody {
  name?: string
  publicDisplay?: PublicDisplay
}

export interface DrawBody {
  /** Mark this item (physical drum). Omitted: the server draws at random. */
  index?: number
}

export interface AnnounceBody {
  kind: AnnouncementKind
  text?: string
  cardCode?: string
}

// ─── Live state ────────────────────────────────────────────────────────────

export interface DrawnItem extends BingoItem {
  at: string
}

export interface LiveGame {
  id: string
  name: string
  setId: string
  setName: string
  color: string
  publicDisplay: PublicDisplay
  status: 'running' | 'finished'
  startedAt: string
  finishedAt: string | null
  /** Items in the set. */
  total: number
  /** Every item of the set, by index (for the board). */
  items: BingoItem[]
  /** Drawn items in draw order (last = most recent). */
  draws: DrawnItem[]
}

export interface LiveState {
  /**
   * Increases with every change, also across server restarts (the server
   * uses max(previous + 1, Date.now())); clients ignore older states.
   */
  version: number
  settings: Settings
  /** Running game, or the last finished one until a new game starts. */
  game: LiveGame | null
  /** Shown on the public screen until hidden or replaced. */
  announcement: Announcement | null
}

export interface DrawResult {
  item: DrawnItem
  state: LiveState
}

// ─── Sets ──────────────────────────────────────────────────────────────────

export interface SetBody {
  name: string
  description?: string
  color: string
  publicDisplay: PublicDisplay
  /** In order; each item's index is its position (1-based). */
  items: { label: string; name: string }[]
}

// ─── Card batches ──────────────────────────────────────────────────────────

export interface CardBatch {
  /** 4 characters of the code alphabet (shared/cards/random.ts). */
  id: string
  name: string
  createdAt: string
  /** Secret: whoever has it can rebuild every card of the batch. */
  seed: string
  format: CardFormat
  setId: string
  setName: string
  /** Snapshot of the set's items. */
  items: BingoItem[]
  count: number
  firstNumber: number
}

export type CardBatchSummary = Omit<CardBatch, 'seed' | 'items'>

export interface RegisterBatchBody {
  id: string
  name: string
  seed: string
  format: CardFormat
  setId: string
  count: number
  firstNumber: number
  /** Only for sets that are not on the server (imported in the generator). */
  items?: BingoItem[]
  setName?: string
}

export interface CardCheckResult {
  code: string
  number: number
  batch: CardBatchSummary
  cells: number[][]
  /** Label of each item index on the card. */
  labels: Record<number, string>
  check: CardCheck
  /** Game checked against, or null when there is none. */
  game: { id: string; name: string; setId: string; drawCount: number } | null
  /** The batch's set is not the game's set (the check is meaningless). */
  setMismatch: boolean
}
