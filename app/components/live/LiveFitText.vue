<script setup lang="ts">
// Text that takes the largest font size that fits the box its parent gives
// it. It wraps between words but never inside one, unless a single word is
// still too wide at the minimum size. The box size never depends on the text
// (the text is positioned absolutely), so resizing cannot loop.

const props = withDefaults(
  defineProps<{
    text: string
    /** Largest font size as a fraction of the box height. */
    maxRatio?: number
    /** Smallest font size, in px. */
    min?: number
  }>(),
  { maxRatio: 1, min: 8 }
)

const box = useTemplateRef<HTMLElement>('box')
const inner = useTemplateRef<HTMLElement>('inner')

function fits(el: HTMLElement, height: number) {
  return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= height + 1
}

function fit() {
  const b = box.value
  const el = inner.value
  if (!b || !el) return
  const height = b.clientHeight
  if (!b.clientWidth || !height) return

  el.style.overflowWrap = 'normal'
  let lo = props.min
  let hi = Math.max(lo, height * props.maxRatio)
  el.style.fontSize = `${hi}px`
  if (!fits(el, height)) {
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2
      el.style.fontSize = `${mid}px`
      if (fits(el, height)) lo = mid
      else hi = mid
    }
    el.style.fontSize = `${lo}px`
  }
  if (!fits(el, height)) el.style.overflowWrap = 'anywhere'
}

let frame = 0
function scheduleFit() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0
    fit()
  })
}

useResizeObserver(box, scheduleFit)
watch(() => [props.text, props.maxRatio, props.min], scheduleFit, { flush: 'post' })

onMounted(() => {
  fit()
  // Web fonts change the metrics when they arrive.
  document.fonts?.ready.then(scheduleFit)
  document.fonts?.addEventListener('loadingdone', scheduleFit)
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  document.fonts?.removeEventListener('loadingdone', scheduleFit)
})
</script>

<template>
  <span ref="box" class="fit-text">
    <span ref="inner" class="fit-text__inner">{{ text }}</span>
  </span>
</template>

<style scoped>
.fit-text {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

.fit-text__inner {
  position: absolute;
  top: 50%;
  left: 0;
  display: block;
  width: 100%;
  transform: translateY(-50%);
  text-align: center;
  text-wrap: balance;
  overflow-wrap: normal;
  hyphens: manual;
}
</style>
