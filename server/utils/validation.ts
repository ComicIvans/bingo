import { z } from 'zod'
import type { H3Event } from 'h3'
import { ENGINE_VERSIONS } from '#shared/cards/grid'

// Request validation. Schemas carry their own Spanish messages for the
// errors people can actually make; anything else (a malformed request) falls
// back to zod's Spanish locale, prefixed with the field it refers to.

const FIELD_NAMES: Record<string, string> = {
  key: 'clave',
  name: 'nombre',
  setId: 'conjunto',
  setName: 'nombre del conjunto',
  publicDisplay: 'qué se muestra',
  force: 'forzar',
  index: 'elemento',
  kind: 'tipo',
  text: 'texto',
  cardCode: 'código de cartón',
  title: 'título',
  subtitle: 'subtítulo',
  publicTheme: 'tema de la pantalla pública',
  recentCount: 'elementos recientes',
  description: 'descripción',
  color: 'color',
  items: 'elementos',
  label: 'etiqueta',
  id: 'código',
  seed: 'semilla',
  engineVersion: 'versión del generador',
  format: 'formato',
  rows: 'filas',
  cols: 'columnas',
  perRow: 'casillas por fila',
  maxPerColumn: 'máximo por columna',
  columnOrder: 'orden por columnas',
  freeCenter: 'casilla libre',
  count: 'número de cartones',
  firstNumber: 'primer número',
  createdAt: 'fecha de creación',
}

const spanish = z.locales.es().localeError

function describePath(path: PropertyKey[]): string {
  return path
    .map((part) => {
      if (typeof part === 'number') return `n.º ${part + 1}`
      const key = String(part)
      return Object.hasOwn(FIELD_NAMES, key) ? FIELD_NAMES[key]! : key
    })
    .join(' › ')
}

const errorMap: z.core.$ZodErrorMap = (issue) => {
  const fallback = spanish(issue)
  const message = typeof fallback === 'string' ? fallback : fallback?.message
  if (!message) return undefined
  const where = issue.path?.length ? describePath(issue.path) : ''
  return where ? `Campo «${where}»: ${message}.` : `${message}.`
}

/** Validates `value`, or throws a 400 with the first problem in Spanish. */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value, { error: errorMap })
  if (!result.success)
    throw apiError(400, result.error.issues[0]?.message ?? 'Los datos enviados no son válidos.')
  return result.data
}

/** Reads the JSON body (an empty body counts as `{}`) and validates it. */
export async function readBodyWith<T extends z.ZodType>(
  event: H3Event,
  schema: T
): Promise<z.output<T>> {
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw apiError(400, 'El cuerpo de la petición no es un JSON válido.')
  }
  return parseWith(schema, body ?? {})
}

/** Route parameter that must match `pattern`; anything else is a 404. */
export function routeParam(event: H3Event, name: string, pattern: RegExp, notFound: string) {
  const value = getRouterParam(event, name, { decode: true }) ?? ''
  if (!pattern.test(value)) throw apiError(404, notFound)
  return value
}

/** Length in characters as people count them (an emoji is one). */
export function charLength(text: string): number {
  return [...text].length
}

// ─── Shared pieces ─────────────────────────────────────────────────────────

export const GAME_ID_PATTERN = /^[a-z0-9]{1,16}-[a-z0-9]{1,16}$/
export const SET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const BATCH_ID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/

export const publicDisplaySchema = z.enum(['label', 'name', 'both'], {
  error: 'Elige qué se muestra en la pantalla pública: etiqueta, nombre o ambos.',
})

const gameNameSchema = z
  .string({ error: 'Escribe un nombre para la partida.' })
  .trim()
  .min(1, 'Escribe un nombre para la partida.')
  .max(80, 'El nombre de la partida no puede pasar de 80 caracteres.')

// ─── Auth ──────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  key: z
    .string({ error: 'Escribe la clave de administración.' })
    .min(1, 'Escribe la clave de administración.')
    .max(1024, 'La clave no es correcta.'),
})

// ─── Game ──────────────────────────────────────────────────────────────────

const batchIdsSchema = z
  .array(
    z
      .string({ error: 'Cada lote se indica por su código.' })
      .trim()
      .toUpperCase()
      .regex(BATCH_ID_PATTERN, 'Los códigos de lote tienen 4 caracteres, por ejemplo K3F9.'),
    { error: 'Indica los lotes en juego como una lista.' }
  )
  .max(50, 'No puede haber más de 50 lotes en juego.')

export const startGameSchema = z.object({
  name: gameNameSchema,
  setId: z
    .string({ error: 'Elige el conjunto de la partida.' })
    .trim()
    .min(1, 'Elige el conjunto de la partida.'),
  publicDisplay: publicDisplaySchema.optional(),
  force: z.boolean().optional(),
  batchIds: batchIdsSchema.optional(),
})

export const updateGameSchema = z.object({
  name: gameNameSchema.optional(),
  publicDisplay: publicDisplaySchema.optional(),
  batchIds: batchIdsSchema.optional(),
})

export const drawSchema = z.object({
  index: z
    .number({ error: 'El elemento debe ser un número.' })
    .int('El elemento debe ser un número entero.')
    .min(1, 'Ese elemento no está en el conjunto de la partida.')
    .optional(),
})

export const announceSchema = z
  .object({
    kind: z.enum(['line', 'bingo', 'message'], {
      error: 'El anuncio debe ser de línea, de bingo o un mensaje.',
    }),
    text: z
      .string()
      .trim()
      .max(200, 'El texto del anuncio no puede pasar de 200 caracteres.')
      .optional(),
    cardCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(20, 'El código del cartón no puede pasar de 20 caracteres.')
      .optional(),
  })
  .refine((body) => body.kind !== 'message' || !!body.text, {
    error: 'Escribe el texto del mensaje.',
    path: ['text'],
  })

// ─── Sets ──────────────────────────────────────────────────────────────────

export const setBodySchema = z.object({
  name: z
    .string({ error: 'Escribe un nombre para el conjunto.' })
    .trim()
    .min(1, 'Escribe un nombre para el conjunto.')
    .max(60, 'El nombre del conjunto no puede pasar de 60 caracteres.'),
  description: z
    .string()
    .trim()
    .max(300, 'La descripción no puede pasar de 300 caracteres.')
    .optional(),
  color: z
    .string({ error: 'Elige un color.' })
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe tener el formato #rrggbb.')
    .transform((color) => color.toLowerCase()),
  publicDisplay: publicDisplaySchema,
  items: z
    .array(
      z.object({
        label: z.string({ error: 'Cada elemento necesita una etiqueta.' }),
        name: z.string().optional(),
      }),
      { error: 'Añade los elementos del conjunto.' }
    )
    .min(1, 'Añade al menos un elemento.')
    .max(500, 'Un conjunto no puede tener más de 500 elementos.'),
})

// ─── Settings ──────────────────────────────────────────────────────────────

export const settingsSchema = z.object({
  title: z.string().trim().max(80, 'El título no puede pasar de 80 caracteres.').optional(),
  subtitle: z.string().trim().max(120, 'El subtítulo no puede pasar de 120 caracteres.').optional(),
  publicTheme: z
    .enum(['dark', 'light'], { error: 'El tema de la pantalla pública debe ser oscuro o claro.' })
    .optional(),
  recentCount: z
    .number({ error: 'Los elementos recientes deben ser un número.' })
    .int('Los elementos recientes deben ser un número entero.')
    .min(0, 'Los elementos recientes deben estar entre 0 y 20.')
    .max(20, 'Los elementos recientes deben estar entre 0 y 20.')
    .optional(),
  boardCheck: z
    .boolean({ error: 'Indica si se pueden comprobar cartones desde el tablero.' })
    .optional(),
})

// ─── Card batches ──────────────────────────────────────────────────────────

const dimension = (what: string) =>
  z
    .number({ error: `${what} debe ser un número.` })
    .int(`${what} debe ser un número entero.`)
    .min(1, `${what} debe estar entre 1 y 12.`)
    .max(12, `${what} debe estar entre 1 y 12.`)

export const cardFormatSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('classic90') }),
    z.object({ kind: z.literal('american75'), freeCenter: z.boolean() }),
    z.object({
      kind: z.literal('custom'),
      rows: dimension('El número de filas'),
      cols: dimension('El número de columnas'),
      perRow: dimension('Las casillas por fila'),
      maxPerColumn: dimension('El máximo por columna'),
      columnOrder: z.boolean(),
      freeCenter: z.boolean(),
    }),
  ],
  { error: 'El formato de los cartones no es válido.' }
)

const batchIdSchema = z
  .string({ error: 'Falta el código del lote.' })
  .trim()
  .toUpperCase()
  .regex(BATCH_ID_PATTERN, 'El código del lote debe tener 4 caracteres (números y letras).')

const seedSchema = z
  .string({ error: 'Falta la semilla del lote.' })
  .min(16, 'La semilla del lote debe tener entre 16 y 128 caracteres.')
  .max(128, 'La semilla del lote debe tener entre 16 y 128 caracteres.')

// Missing means 1: batches and files from before versions existed.
const engineVersionSchema = z
  .number({ error: 'La versión del generador debe ser un número.' })
  .int('La versión del generador debe ser un número entero.')
  .refine(
    (version) => ENGINE_VERSIONS.includes(version),
    'Los cartones se generaron con una versión del generador que este servidor no conoce. Actualiza la aplicación.'
  )
  .default(1)

const countSchema = z
  .number({ error: 'El número de cartones debe ser un número.' })
  .int('El número de cartones debe ser un número entero.')
  .min(1, 'El lote debe tener entre 1 y 5000 cartones.')
  .max(5000, 'El lote debe tener entre 1 y 5000 cartones.')

const firstNumberSchema = z
  .number({ error: 'El primer número debe ser un número.' })
  .int('El primer número debe ser un número entero.')
  .min(1, 'El primer número de cartón debe ser 1 o más.')

// Looser than server sets: a batch may come from a set imported only in the
// generator (up to 1000 items, free-form labels). The items are only kept to
// rebuild and label the cards.
const batchItemsSchema = z
  .array(
    z.object({
      index: z.number().int().min(1).max(100_000),
      label: z
        .string()
        .trim()
        .min(1, 'Cada elemento necesita una etiqueta.')
        .refine(
          (label) => charLength(label) <= 60,
          'Las etiquetas no pueden pasar de 60 caracteres.'
        ),
      name: z
        .string()
        .trim()
        .refine(
          (name) => charLength(name) <= 200,
          'Los nombres no pueden pasar de 200 caracteres.'
        ),
    }),
    { error: 'Faltan los elementos del conjunto.' }
  )
  .min(1, 'El conjunto del lote no tiene elementos.')
  .max(1000, 'El conjunto del lote no puede tener más de 1000 elementos.')
  .refine(
    (items) => new Set(items.map((item) => item.index)).size === items.length,
    'Hay elementos repetidos en el conjunto del lote.'
  )

// Card codes carry at most 6 digits (parseCardCode).
const LAST_CARD_NUMBER = 999_999
const numbersFit = (batch: { firstNumber: number; count: number }) =>
  batch.firstNumber + batch.count - 1 <= LAST_CARD_NUMBER
const numbersFitError = {
  error: `Los números de cartón no pueden pasar de ${LAST_CARD_NUMBER}.`,
  path: ['firstNumber'],
}

export const registerBatchSchema = z
  .object({
    id: batchIdSchema,
    name: z
      .string()
      .trim()
      .refine(
        (name) => charLength(name) <= 120,
        'El nombre del lote no puede pasar de 120 caracteres.'
      )
      .default(''),
    seed: seedSchema,
    engineVersion: engineVersionSchema,
    format: cardFormatSchema,
    setId: z
      .string({ error: 'Falta el conjunto del lote.' })
      .trim()
      .min(1, 'Falta el conjunto del lote.')
      .max(64),
    count: countSchema,
    firstNumber: firstNumberSchema,
    items: batchItemsSchema.optional(),
    setName: z
      .string()
      .trim()
      .refine(
        (name) => charLength(name) <= 80,
        'El nombre del conjunto no puede pasar de 80 caracteres.'
      )
      .optional(),
  })
  .refine(numbersFit, numbersFitError)

export const importBatchSchema = z
  .object({
    id: batchIdSchema,
    name: z
      .string()
      .trim()
      .refine(
        (name) => charLength(name) <= 120,
        'El nombre del lote no puede pasar de 120 caracteres.'
      )
      .default(''),
    createdAt: z
      .string({ error: 'Falta la fecha de creación del lote.' })
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        'La fecha de creación del lote no es válida.'
      )
      .transform((value) => new Date(value).toISOString()),
    seed: seedSchema,
    engineVersion: engineVersionSchema,
    format: cardFormatSchema,
    setId: z
      .string({ error: 'Falta el conjunto del lote.' })
      .trim()
      .min(1, 'Falta el conjunto del lote.')
      .max(64),
    setName: z
      .string()
      .trim()
      .refine(
        (name) => charLength(name) <= 80,
        'El nombre del conjunto no puede pasar de 80 caracteres.'
      )
      .default(''),
    items: batchItemsSchema,
    count: countSchema,
    firstNumber: firstNumberSchema,
  })
  .refine(numbersFit, numbersFitError)
