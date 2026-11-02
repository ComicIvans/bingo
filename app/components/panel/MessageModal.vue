<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { cardCode, parseCardCode } from '#shared/cards/grid'

// Free-text announcement for the public screen, optionally tied to a card.

const open = defineModel<boolean>('open', { default: false })

const admin = useAdmin()

const schema = z.object({
  text: z.string().trim().min(1, 'Escribe el mensaje.').max(200, 'Como máximo 200 caracteres.'),
  cardCode: z
    .string()
    .trim()
    .refine((value) => !value || parseCardCode(value) !== null, {
      message: 'Código de cartón no válido (ejemplo: K3F9-042).',
    }),
})
type Schema = z.output<typeof schema>

const state = reactive({ text: '', cardCode: '' })

watch(open, (value) => {
  if (value) Object.assign(state, { text: '', cardCode: '' })
})

async function submit(event: FormSubmitEvent<Schema>) {
  const parsed = event.data.cardCode ? parseCardCode(event.data.cardCode) : null
  const result = await admin.announce({
    kind: 'message',
    text: event.data.text,
    cardCode: parsed ? cardCode(parsed.batchId, parsed.number, parsed.number) : undefined,
  })
  if (result) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Mensaje en la pantalla pública"
    description="Se muestra a todo el público hasta que lo ocultes, hagas otro anuncio o saques la siguiente bola."
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <UForm
        id="panel-message-form"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="submit"
      >
        <UFormField name="text" label="Mensaje" required>
          <UTextarea
            v-model="state.text"
            :rows="3"
            autoresize
            :maxrows="6"
            maxlength="200"
            class="w-full"
            placeholder="Descanso de 10 minutos"
            autofocus
          />
        </UFormField>
        <UFormField
          name="cardCode"
          label="Código de cartón"
          hint="Opcional"
          description="Si el mensaje se refiere a un cartón concreto."
        >
          <UInput
            v-model="state.cardCode"
            class="w-full"
            :ui="{ base: 'font-mono uppercase' }"
            placeholder="K3F9-042"
            autocomplete="off"
            spellcheck="false"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer="{ close }">
      <UButton label="Cancelar" color="neutral" variant="outline" @click="close" />
      <UButton
        type="submit"
        form="panel-message-form"
        label="Anunciar"
        icon="i-lucide-megaphone"
        :loading="admin.pending.value"
      />
    </template>
  </UModal>
</template>
