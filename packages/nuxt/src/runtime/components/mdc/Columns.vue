<script setup lang="ts">
import { columnGroups } from '@vignettes/core/deck'
import { computed, onMounted, ref } from 'vue'

interface Props {
  /**
   * Text scale of the columns.
   * @fr Taille du texte des colonnes.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

defineSlots<{
  /** `::Column` blocks, or markdown that splits in two at its first horizontal rule, or else before each `###` or `####` heading. */
  default?: () => unknown
}>()

const container = ref<HTMLElement | null>(null)

const sizeClass = computed(() => `size-${props.size}`)

onMounted(() => {
  if (!container.value)
    return

  const children = Array.from(container.value.children) as HTMLElement[]
  const columns = columnGroups(children, child => child.classList.contains('column')
    ? 'column'
    : child.tagName === 'HR' ? 'rule' : ['H3', 'H4'].includes(child.tagName) ? 'heading' : 'other')
  if (!columns)
    return

  container.value.innerHTML = ''

  columns.forEach((colChildren) => {
    const div = document.createElement('div')
    div.className = 'column'
    colChildren.forEach(child => div.appendChild(child))
    container.value!.appendChild(div)
  })
})
</script>

<template>
  <div
    ref="container"
    class="columns"
    :class="sizeClass"
  >
    <slot />
  </div>
</template>

<style scoped>
.columns {
  display: flex;
  gap: 4rem;
  width: 100%;
  align-items: flex-start;
}

.columns :deep(.column) {
  flex: var(--column-grow, 1) 1 0;
  min-width: 0;
}

.columns :deep(.column h3),
.columns :deep(.column h4) {
  margin-top: 0;
}

.size-xs { font-size: 0.7em; }
.size-sm { font-size: 0.85em; }
.size-md { font-size: 1em; }
.size-lg { font-size: 1.15em; }
.size-xl { font-size: 1.3em; }
</style>
