<script setup lang="ts">
// Image library and uploaded fonts of the design.

import fontkit from '@pdf-lib/fontkit'
import { SERVER_LOGO_ID } from '#shared/cards/design'
import { randomCode } from '#shared/cards/random'
import { useGenerator } from '~/composables/generator/useGenerator'
import { removeCustomFontFromDesign } from '~/utils/generator/design'
import { baseName, bytesToDataUrl, formatBytes, pickFile } from '~/utils/generator/files'
import { useImageUpload } from '~/composables/generator/useImageUpload'
import { isEmbeddableFont } from '~/utils/generator/fonts'

const { design, images, storageProblem } = useGenerator()
const toast = useToast()

const MAX_FONT_BYTES = 8 * 1024 * 1024

const imageList = computed(() =>
  Object.entries(design.value.images).map(([id, image]) => ({
    id,
    image,
    href: images.href(id),
    locked: id === SERVER_LOGO_ID,
  }))
)

const fontList = computed(() =>
  Object.entries(design.value.customFonts ?? {}).map(([key, font]) => ({
    id: `custom:${key}`,
    name: font.name,
    size: Math.round((font.src.length - font.src.indexOf(',') - 1) * 0.75),
  }))
)

const { upload, uploading } = useImageUpload()

function uploadImage() {
  void upload('Ya puedes elegirla en la cabecera, el pie, la casilla libre o el reverso.')
}

async function uploadFont() {
  const file = await pickFile('.ttf,.otf,font/ttf,font/otf,application/x-font-ttf')
  if (!file) return
  try {
    if (file.size > MAX_FONT_BYTES)
      throw new Error(
        `La fuente ocupa ${formatBytes(file.size)} y el máximo es ${formatBytes(MAX_FONT_BYTES)}.`
      )
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isEmbeddableFont(bytes))
      throw new Error('Solo se admiten fuentes TrueType (.ttf) u OpenType (.otf).')
    let name = baseName(file.name)
    try {
      const font = fontkit.create(bytes)
      name = font.fullName || font.familyName || name
    } catch {
      throw new Error('El archivo no es una fuente válida o está dañado.')
    }
    const key = randomCode(6).toLowerCase()
    design.value.customFonts = {
      ...design.value.customFonts,
      [key]: { name, src: bytesToDataUrl(bytes, 'font/ttf') },
    }
    toast.add({
      title: 'Fuente añadida',
      description: `«${name}» aparece en el grupo «Subidas» de cada selector de fuente.`,
      color: 'success',
      icon: 'i-lucide-type',
    })
  } catch (e) {
    toast.add({
      title: 'No se pudo añadir la fuente',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
      icon: 'i-lucide-circle-x',
    })
  }
}

function renameImage(id: string, name: string | number) {
  const image = design.value.images[id]
  if (image) image.name = String(name).slice(0, 120)
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <UAlert
      v-if="storageProblem === 'quota'"
      color="warning"
      variant="subtle"
      icon="i-lucide-hard-drive"
      title="Las imágenes y fuentes no se guardarán en este navegador"
      description="Ocupan más de lo que el navegador permite guardar. Siguen disponibles mientras no cierres la página; usa «Exportar diseño» para conservarlas."
    />
    <UAlert
      v-else-if="storageProblem === 'unavailable'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-hard-drive"
      title="Este navegador no permite guardar el diseño"
      description="Usa «Exportar diseño» si quieres conservarlo para otra vez."
    />

    <section class="flex flex-col gap-3" aria-labelledby="generator-images-title">
      <div class="flex items-center justify-between gap-2">
        <h3 id="generator-images-title" class="text-sm font-medium text-highlighted">Imágenes</h3>
        <UButton
          icon="i-lucide-image-plus"
          label="Subir imagen"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="uploading"
          @click="uploadImage"
        />
      </div>
      <ul class="flex flex-col gap-2">
        <li
          v-for="entry in imageList"
          :key="entry.id"
          class="flex items-center gap-3 rounded-lg border border-default p-2"
        >
          <div
            class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-default bg-white"
          >
            <img
              v-if="entry.href"
              :src="entry.href"
              alt=""
              class="max-h-full max-w-full object-contain"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p v-if="entry.locked" class="truncate text-sm font-medium">{{ entry.image.name }}</p>
            <UInput
              v-else
              :model-value="entry.image.name"
              size="sm"
              variant="ghost"
              class="w-full"
              :aria-label="`Nombre de la imagen ${entry.image.name}`"
              @update:model-value="(name) => renameImage(entry.id, name)"
            />
            <p class="truncate text-xs text-muted">
              {{
                entry.locked
                  ? 'Se cambia desde el panel'
                  : `${Math.round(entry.image.width)} × ${Math.round(entry.image.height)} px`
              }}
            </p>
          </div>
          <UButton
            v-if="!entry.locked"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :aria-label="`Quitar la imagen ${entry.image.name}`"
            @click="images.remove(entry.id)"
          />
        </li>
      </ul>
      <p class="text-xs text-muted">
        PNG, JPEG, SVG o WebP de hasta 5 MB. Las imágenes SVG y WebP se convierten a PNG de alta
        resolución al generar el PDF.
      </p>
    </section>

    <USeparator />

    <section class="flex flex-col gap-3" aria-labelledby="generator-fonts-title">
      <div class="flex items-center justify-between gap-2">
        <h3 id="generator-fonts-title" class="text-sm font-medium text-highlighted">
          Fuentes subidas
        </h3>
        <UButton
          icon="i-lucide-type"
          label="Subir fuente"
          size="sm"
          color="neutral"
          variant="outline"
          @click="uploadFont"
        />
      </div>
      <ul v-if="fontList.length" class="flex flex-col gap-2">
        <li
          v-for="font in fontList"
          :key="font.id"
          class="flex items-center gap-3 rounded-lg border border-default px-3 py-2"
        >
          <UIcon name="i-lucide-type" class="size-5 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ font.name }}</p>
            <p class="text-xs text-muted">{{ formatBytes(font.size) }}</p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :aria-label="`Quitar la fuente ${font.name}`"
            @click="removeCustomFontFromDesign(design, font.id)"
          />
        </li>
      </ul>
      <p class="text-xs text-muted">
        Archivos .ttf u .otf. La fuente se incrusta completa en el PDF; comprueba que su licencia lo
        permite. Los caracteres que no tenga se dibujan con las fuentes Noto incluidas.
      </p>
    </section>
  </div>
</template>
