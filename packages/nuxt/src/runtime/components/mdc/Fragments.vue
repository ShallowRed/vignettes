<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'
import { REVEAL_SYNC } from '../../config/injection-keys.ts'
import { fragmentEffects } from '../../utils/fragment-effects.ts'

// Turns each direct child (each item of a direct list) into a Reveal fragment,
// revealed one step at a time with the arrow keys.
interface Props {
  /**
   * Reveal fragment effects, separated by spaces: `fade-in`, `fade-up`, `fade-left`, `grow`, `highlight-current-blue`, `fade-up grow`…
   * @fr Effets d'apparition de Reveal, séparés par des espaces : `fade-in`, `fade-up`, `fade-left`, `grow`, `highlight-current-blue`, `fade-up grow`…
   */
  effect?: string
  /**
   * Dims the items already shown once a later one is current.
   * @fr Atténue les éléments déjà montrés quand un élément suivant apparaît.
   */
  dim?: boolean
  /**
   * With an effect that shows an item at its step, the items still hidden take no space: the slide lays out its content again at each step, and an item appears with a fade.
   * @fr Avec un effet qui montre un élément à son étape, les éléments encore cachés ne prennent pas de place : la diapositive se recompose à chaque étape, et l'élément apparaît en fondu.
   */
  collapse?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  effect: 'fade-in',
  dim: false,
  collapse: false,
})

defineSlots<{
  /** A markdown list, whose items appear one at a time; each other block is one step. */
  default?: () => unknown
}>()

const root = ref<HTMLElement | null>(null)
const revealSync = inject(REVEAL_SYNC, undefined)

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
  const effects = fragmentEffects(props.effect)
  for (const el of targets)
    el.classList.add('fragment', ...effects)
  revealSync?.()
})
</script>

<template>
  <div
    ref="root"
    class="fragments"
    :class="{ 'fragments--dim': dim, 'fragments--collapse': collapse }"
  >
    <slot />
  </div>
</template>

<style scoped>
.fragments--dim:has(.current-fragment) :deep(.fragment.visible:not(.current-fragment)) {
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

/* The effects that show an item before its step keep it in the layout. */
.fragments--collapse :deep(.fragment:not(.visible, .grow, .shrink, .strike, .fade-out, .semi-fade-out, [class*='highlight-'])) {
  display: none;
}

@starting-style {
  .fragments--collapse :deep(.fragment.visible) {
    opacity: 0;
  }
}
</style>
