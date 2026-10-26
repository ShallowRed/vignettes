<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'

// Turns each direct child (each item of a direct list) into a Reveal fragment,
// revealed one step at a time with the arrow keys.
interface Props {
  /** Reveal fragment effect: `fade-in`, `fade-up`, `fade-left`, `grow`, `highlight-current-blue`… */
  effect?: string
  /** Dims the items already shown once a later one is current. */
  dim?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  effect: 'fade-in',
  dim: false,
})

defineSlots<{
  /** A markdown list, whose items appear one at a time; each other block is one step. */
  default?: () => unknown
}>()

const root = ref<HTMLElement | null>(null)
const revealSync = inject<(() => void) | undefined>('revealSync', undefined)

onMounted(() => {
  if (!root.value)
    return
  const targets: Element[] = []
  for (const child of Array.from(root.value.children)) {
    if (child.tagName === 'UL' || child.tagName === 'OL')
      targets.push(...Array.from(child.children))
    else
      targets.push(child)
  }
  for (const el of targets) {
    el.classList.add('fragment')
    if (props.effect !== 'fade-in')
      el.classList.add(props.effect)
  }
  revealSync?.()
})
</script>

<template>
  <div
    ref="root"
    class="fragments"
    :class="{ 'fragments--dim': dim }"
  >
    <slot />
  </div>
</template>

<style scoped>
.fragments--dim:has(.current-fragment) :deep(.fragment.visible:not(.current-fragment)) {
  opacity: 0.4;
  transition: opacity 0.3s ease;
}
</style>
