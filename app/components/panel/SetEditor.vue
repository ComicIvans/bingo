<script setup lang="ts">
import type { SetBody } from '#shared/types/api'
import type { BingoSet, PublicDisplay } from '#shared/types/bingo'

// Create or edit a custom set. Items are typed as "label;name" lines, with a
// live preview and validation, or imported from a CSV/TXT file.

const props = defineProps<{
  /** Set being edited (id) or a starting point for a new one (no id). */
  initial: { id?: string; body: SetBody } | null
}>()

const emit = defineEmits<{ saved: [set: BingoSet] }>()

const open = defineModel<boolean>('open', { default: false })

const admin = useAdmin()
const toast = useToast()

const MAX_LABEL = 12
const MAX_NAME = 80
const MIN_ITEMS = 2
const MAX_ITEMS = 500

const form = reactive({
  name: '',
  description: '',
  color: '#b0e0e6',
  publicDisplay: 'label' as PublicDisplay,
  text: '',
})
const submitted = ref(false)

const editing = computed(() => !!props.initial?.id)

function itemsToText(items: SetBody['items']) {
  return items
    .map((i) => (i.name && i.name !== i.label ? `${i.label};${i.name}` : i.label))
    .join('\n')
}

watch(open, (value) => {
  if (!value) return
  const body = props.initial?.body
  Object.assign(form, {
    name: body?.name ?? '',
    description: body?.description ?? '',
    color: body?.color ?? '#b0e0e6',
    publicDisplay: body?.publicDisplay ?? 'label',
    text: body ? itemsToText(body.items) : '',
  })
  submitted.value = false
})

// ─── Items parsing ─────────────────────────────────────────────────────────

interface PreviewRow {
  index: number
  line: number
  label: string
  name: string
  error?: string
}

const parsed = computed(() => {
  const rows: PreviewRow[] = []
  const errors: string[] = []
  const firstLine = new Map<string, number>()

  form.text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    if (!raw.trim()) return
    const cut = raw.indexOf(';')
    // NFC like the server, so "é" typed two ways counts as the same label.
    const label = (cut === -1 ? raw : raw.slice(0, cut)).normalize('NFC').trim()
    const name = (cut === -1 ? '' : raw.slice(cut + 1)).normalize('NFC').trim() || label
    let error: string | undefined
    if (!label) error = 'Falta la etiqueta.'
    else if ([...label].length > MAX_LABEL)
      error = `La etiqueta tiene más de ${MAX_LABEL} caracteres.`
    else if ([...name].length > MAX_NAME) error = `El nombre tiene más de ${MAX_NAME} caracteres.`
    else if (firstLine.has(label))
      error = `La etiqueta «${label}» ya está en la línea ${firstLine.get(label)}.`
    if (label && !firstLine.has(label)) firstLine.set(label, line)
    if (error) errors.push(`Línea ${line}: ${error}`)
    rows.push({ index: rows.length + 1, line, label, name, error })
  })

  if (rows.length < MIN_ITEMS) errors.push(`Añade al menos ${MIN_ITEMS} elementos.`)
  if (rows.length > MAX_ITEMS) errors.push(`Como máximo ${MAX_ITEMS} elementos.`)
  return { rows, errors }
})

const fieldErrors = computed(() => {
  const errors: Partial<Record<'name' | 'description' | 'color' | 'items', string>> = {}
  if (!form.name.trim()) errors.name = 'Ponle un nombre al conjunto.'
  else if (form.name.trim().length > 60) errors.name = 'Como máximo 60 caracteres.'
  if (form.description.length > 300) errors.description = 'Como máximo 300 caracteres.'
  if (!/^#[0-9a-f]{6}$/i.test(form.color)) errors.color = 'Usa un color hexadecimal, como #b0e0e6.'
  if (parsed.value.errors.length) errors.items = parsed.value.errors[0]
  return errors
})
const valid = computed(() => Object.keys(fieldErrors.value).length === 0)

// ─── Import ────────────────────────────────────────────────────────────────

/** Splits one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string, separator: string): string[] {
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') quoted = false
      else current += char
    } else if (char === '"') quoted = true
    else if (char === separator) {
      fields.push(current)
      current = ''
    } else current += char
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

const HEADER = /^(etiqueta|label|s[ií]mbolo|c[oó]digo|n[uú]mero)$/i

function importText(content: string): number {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
  const sample = lines.slice(0, 20).join('\n')
  const separator = sample.includes(';') ? ';' : sample.includes('\t') ? '\t' : ','
  const rows = lines.map((l) => splitCsvLine(l, separator))
  if (rows[0] && HEADER.test(rows[0][0] ?? '')) rows.shift()
  form.text = rows
    .filter((r) => r[0])
    .map((r) => {
      const label = r[0]!.replace(/;/g, ',')
      const name = r[1] ?? ''
      return name && name !== label ? `${label};${name}` : label
    })
    .join('\n')
  return rows.length
}

const { open: openFile, onChange } = useFileDialog({
  accept: '.csv,.txt,text/csv,text/plain',
  multiple: false,
  reset: true,
})

onChange(async (files) => {
  const file = files?.[0]
  if (!file) return
  if (file.size > 1024 * 1024) {
    toast.add({
      title: 'El archivo es demasiado grande',
      description: 'Como máximo 1 MB.',
      color: 'error',
      icon: 'i-lucide-file-x',
    })
    return
  }
  const count = importText(await file.text())
  toast.add({
    title: 'Archivo importado',
    description: `${count} ${count === 1 ? 'línea leída' : 'líneas leídas'} de «${file.name}». Revisa la vista previa.`,
    color: 'success',
    icon: 'i-lucide-file-check',
  })
})

// ─── Save ──────────────────────────────────────────────────────────────────

async function save() {
  submitted.value = true
  if (!valid.value || admin.pending.value) return
  const body: SetBody = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    color: form.color.toLowerCase(),
    publicDisplay: form.publicDisplay,
    items: parsed.value.rows.map(({ label, name }) => ({ label, name })),
  }
  const id = props.initial?.id
  const saved = id ? await admin.updateSet(id, body) : await admin.createSet(body)
  if (!saved) return
  toast.add({
    title: id ? 'Conjunto guardado' : 'Conjunto creado',
    description: `«${saved.name}» con ${saved.items.length} elementos.`,
    color: 'success',
    icon: 'i-lucide-check',
  })
  emit('saved', saved)
  open.value = false
}

const shown = (key: keyof typeof fieldErrors.value) =>
  submitted.value || (key === 'items' && form.text.trim()) ? fieldErrors.value[key] : undefined
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="editing ? 'Editar conjunto' : 'Nuevo conjunto'"
    description="Cada elemento tiene una etiqueta corta (la que se imprime en los cartones) y un nombre (el que se anuncia)."
    :ui="{ content: 'sm:max-w-4xl', footer: 'justify-end' }"
  >
    <template #body>
      <form id="panel-set-form" class="space-y-6" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Nombre" required :error="shown('name')">
            <UInput v-model="form.name" class="w-full" maxlength="60" />
          </UFormField>
          <UFormField
            label="Color"
            :error="shown('color')"
            help="Color de acento del tablero y de los cartones."
          >
            <div class="flex items-center gap-2">
              <UPopover>
                <UButton
                  color="neutral"
                  variant="outline"
                  square
                  aria-label="Elegir color"
                  class="shrink-0"
                >
                  <span
                    class="size-5 rounded ring-1 ring-default"
                    :style="{ backgroundColor: form.color }"
                  />
                </UButton>
                <template #content>
                  <UColorPicker
                    :model-value="form.color"
                    class="p-2"
                    @update:model-value="(value) => value && (form.color = value)"
                  />
                </template>
              </UPopover>
              <UInput
                v-model="form.color"
                class="w-full"
                :ui="{ base: 'font-mono' }"
                maxlength="7"
                aria-label="Color en hexadecimal"
              />
            </div>
          </UFormField>
          <UFormField
            label="Descripción"
            hint="Opcional"
            :error="shown('description')"
            class="sm:col-span-2"
          >
            <UInput v-model="form.description" class="w-full" maxlength="300" />
          </UFormField>
          <UFormField class="sm:col-span-2">
            <URadioGroup
              v-model="form.publicDisplay"
              legend="Por defecto, la pantalla pública muestra"
              :items="PANEL_DISPLAY_OPTIONS"
              orientation="horizontal"
              variant="table"
            />
          </UFormField>
        </div>

        <USeparator />

        <div class="grid gap-4 lg:grid-cols-2">
          <UFormField
            label="Elementos"
            required
            :error="shown('items')"
            help="Uno por línea: etiqueta;nombre. Si no pones nombre se usa la etiqueta. El orden fija la columna en los cartones."
          >
            <template #hint>
              <UButton
                label="Importar CSV/TXT"
                icon="i-lucide-file-up"
                color="neutral"
                variant="link"
                size="xs"
                class="p-0"
                @click="openFile()"
              />
            </template>
            <UTextarea
              v-model="form.text"
              :rows="16"
              class="w-full"
              :ui="{ base: 'font-mono text-sm' }"
              placeholder="1;Uno&#10;2;Dos&#10;H;Hidrógeno"
              spellcheck="false"
            />
          </UFormField>

          <div class="min-w-0">
            <p class="mb-1.5 flex items-center justify-between text-sm">
              <span class="font-medium text-default">Vista previa</span>
              <span class="text-muted">
                {{ parsed.rows.length }} {{ parsed.rows.length === 1 ? 'elemento' : 'elementos' }}
              </span>
            </p>
            <div
              class="max-h-[26rem] overflow-y-auto rounded-md border border-default"
              aria-live="polite"
            >
              <table class="w-full text-sm">
                <thead class="sticky top-0 bg-elevated text-left">
                  <tr>
                    <th scope="col" class="w-12 px-3 py-2 font-semibold">N.º</th>
                    <th scope="col" class="px-3 py-2 font-semibold">Etiqueta</th>
                    <th scope="col" class="px-3 py-2 font-semibold">Nombre</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-if="!parsed.rows.length">
                    <td colspan="3" class="px-3 py-6 text-center text-muted">
                      Escribe o importa los elementos.
                    </td>
                  </tr>
                  <tr
                    v-for="row in parsed.rows"
                    :key="row.line"
                    :class="row.error ? 'bg-error/10' : ''"
                  >
                    <td class="px-3 py-1.5 text-muted tabular-nums">{{ row.index }}</td>
                    <td class="px-3 py-1.5 font-semibold text-highlighted">{{ row.label }}</td>
                    <td class="px-3 py-1.5">
                      <span>{{ row.name }}</span>
                      <span v-if="row.error" class="block text-xs text-error">{{ row.error }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul v-if="parsed.errors.length > 1" class="mt-2 space-y-0.5 text-xs text-error">
              <li v-for="message in parsed.errors.slice(1, 6)" :key="message">{{ message }}</li>
              <li v-if="parsed.errors.length > 6">y {{ parsed.errors.length - 6 }} errores más.</li>
            </ul>
          </div>
        </div>

        <UAlert
          v-if="editing"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          description="Los cambios no afectan a las partidas ya jugadas ni a los lotes de cartones registrados, que guardan su propia copia del conjunto."
        />
      </form>
    </template>

    <template #footer="{ close }">
      <UButton label="Cancelar" color="neutral" variant="outline" @click="close" />
      <UButton
        type="submit"
        form="panel-set-form"
        :label="editing ? 'Guardar cambios' : 'Crear conjunto'"
        icon="i-lucide-check"
        :loading="admin.pending.value"
        :disabled="submitted && !valid"
      />
    </template>
  </USlideover>
</template>
