<script setup lang="ts">
// Confirmation dialog opened through usePanelConfirm(); resolves with true
// only when the user presses the confirm button.

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    color?: 'primary' | 'error' | 'warning' | 'success' | 'neutral'
    icon?: string
  }>(),
  {
    description: undefined,
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    color: 'primary',
    icon: undefined,
  }
)

const emit = defineEmits<{ close: [confirmed: boolean] }>()

// Destructive questions focus Cancel, so a reflex Space or Enter (the
// presenter's draw key) never confirms them by accident.
const safeFocus = computed(() => props.color === 'error' || props.color === 'warning')

// Reka focuses the first tabbable element (the header close button) and
// ignores `autofocus` on elements inserted later, so focus is moved here.
function focusChosenButton(event: Event) {
  const button = (event.target as HTMLElement | null)?.querySelector<HTMLElement>(
    '[data-panel-autofocus]'
  )
  if (!button) return
  event.preventDefault()
  button.focus()
}

// Full class names so Tailwind picks them up.
const ICON_CLASS = {
  primary: 'text-primary',
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success',
  neutral: 'text-muted',
} as const
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="{ onClick: () => emit('close', false) }"
    :content="{ onOpenAutoFocus: focusChosenButton }"
    :ui="{ footer: 'justify-end' }"
  >
    <template v-if="icon" #title>
      <span class="flex items-center gap-2">
        <UIcon :name="icon" class="size-5 shrink-0" :class="ICON_CLASS[color]" />
        {{ title }}
      </span>
    </template>

    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="outline"
        :data-panel-autofocus="safeFocus ? '' : undefined"
        @click="emit('close', false)"
      />
      <UButton
        :label="confirmLabel"
        :color="color"
        :data-panel-autofocus="safeFocus ? undefined : ''"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
