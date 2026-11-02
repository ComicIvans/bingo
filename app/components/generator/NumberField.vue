<script setup lang="ts">
// Numeric input with a unit badge. Empty input keeps the previous value and
// out-of-range values are clamped, so the design never holds NaN.

const props = withDefaults(
  defineProps<{
    label: string
    min?: number
    max?: number
    step?: number
    unit?: string
    hint?: string
    description?: string
    /** The model is a 0-1 fraction shown as a percentage (min/max in %). */
    percent?: boolean
    disabled?: boolean
  }>(),
  {
    min: 0,
    max: 1000,
    step: 1,
    unit: undefined,
    hint: undefined,
    description: undefined,
  }
)

const model = defineModel<number>({ required: true })

const display = computed(() =>
  props.percent ? Math.round(model.value * 1000) / 10 : Math.round(model.value * 1000) / 1000
)

function update(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return
  const clamped = Math.min(props.max, Math.max(props.min, value))
  const next = props.percent ? clamped / 100 : clamped
  if (next !== model.value) model.value = next
}
</script>

<template>
  <UFormField :label="label" :hint="hint" :description="description">
    <template #label>
      {{ label }}<span v-if="unit || percent" class="sr-only"> ({{ percent ? '%' : unit }})</span>
    </template>
    <UFieldGroup class="w-full">
      <UInputNumber
        :model-value="display"
        :min="min"
        :max="max"
        :step="step"
        :step-snapping="false"
        :disabled="disabled"
        :format-options="{ maximumFractionDigits: 2 }"
        locale="es-ES"
        class="w-full min-w-0"
        @update:model-value="update"
      />
      <UBadge
        v-if="unit || percent"
        :label="percent ? '%' : unit"
        color="neutral"
        variant="outline"
        size="lg"
        class="shrink-0 justify-center px-2.5 text-muted"
        aria-hidden="true"
      />
    </UFieldGroup>
  </UFormField>
</template>
