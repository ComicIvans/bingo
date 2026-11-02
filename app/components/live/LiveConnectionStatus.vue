<script setup lang="ts">
// "Reconectando…" pill. It waits a moment before showing up, so the first
// connection after loading the page (and quick network blips) go unnoticed.

const props = withDefaults(defineProps<{ connected: boolean; delay?: number }>(), {
  delay: 2000,
})

const mounted = useMounted()
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  [() => props.connected, mounted],
  ([connected, isMounted]) => {
    clearTimeout(timer)
    if (!isMounted || connected) {
      visible.value = false
      return
    }
    timer = setTimeout(() => (visible.value = true), props.delay)
  },
  { immediate: true }
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div role="status" aria-live="polite" class="pointer-events-none">
    <Transition name="conn">
      <span v-if="visible" class="conn">
        <UIcon name="i-lucide-loader-circle" class="conn__icon size-[1.1em] shrink-0" />
        Reconectando…
      </span>
    </Transition>
  </div>
</template>

<style scoped>
/* Same look on light and dark backgrounds, like a toast. */
.conn {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.45em 0.9em;
  border-radius: 9999px;
  background: rgb(24 24 27 / 0.88);
  color: #fafafa;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
}

.conn__icon {
  color: #fbbf24;
  animation: conn-spin 1s linear infinite;
}

.conn-enter-active,
.conn-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.conn-enter-from,
.conn-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@keyframes conn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .conn__icon {
    animation: none;
  }

  .conn-enter-active,
  .conn-leave-active {
    transition: opacity 0.2s ease;
  }

  .conn-enter-from,
  .conn-leave-to {
    transform: none;
  }
}
</style>
