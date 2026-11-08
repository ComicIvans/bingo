// Text of tinted boxes (alerts and badges in the soft, subtle and outline
// variants). Nuxt UI draws it in the 500 shade (400 in dark mode) over a 10 %
// tint of the same colour, which in light mode gives 1.8:1 for yellow and
// 2:1 for green, and about 3.3:1 for the rest, below the 4.5:1 that WCAG asks
// for small text. The 800 shade (300 in dark mode) gives at least 6.4:1 in
// both themes. The classes are spelled out so Tailwind finds them.
const TINTED_TEXT = {
  primary: 'text-(--ui-color-primary-800) dark:text-(--ui-color-primary-300)',
  secondary: 'text-(--ui-color-secondary-800) dark:text-(--ui-color-secondary-300)',
  success: 'text-(--ui-color-success-800) dark:text-(--ui-color-success-300)',
  info: 'text-(--ui-color-info-800) dark:text-(--ui-color-info-300)',
  warning: 'text-(--ui-color-warning-800) dark:text-(--ui-color-warning-300)',
  error: 'text-(--ui-color-error-800) dark:text-(--ui-color-error-300)',
} as const

const TINTED_VARIANTS = ['outline', 'soft', 'subtle'] as const

function tintedText<Slot extends string>(slot: Slot) {
  return Object.entries(TINTED_TEXT).flatMap(([color, text]) =>
    TINTED_VARIANTS.map((variant) => ({
      color: color as keyof typeof TINTED_TEXT,
      variant,
      class: { [slot]: text } as Record<Slot, string>,
    }))
  )
}

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'rose',
      neutral: 'zinc',
    },
    alert: {
      // Full opacity: the default 90 % lowers the contrast of the description.
      slots: { description: 'opacity-100' },
      compoundVariants: tintedText('root'),
    },
    badge: {
      compoundVariants: tintedText('base'),
    },
  },
})
