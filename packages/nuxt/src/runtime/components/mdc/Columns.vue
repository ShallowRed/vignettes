<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Props {
  /** Text scale of the columns. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

defineSlots<{
  /** `::column` blocks, or markdown that splits in two at its first horizontal rule, or else before each `###` or `####` heading. */
  default?: () => unknown
}>()

const container = ref<HTMLElement | null>(null)

const sizeClass = computed(() => `size-${props.size}`)

onMounted(() => {
  if (!container.value)
    return

  const children = Array.from(container.value.children)
  if (children.length === 0)
    return

  const columnChildren = children.filter(child => child.classList.contains('column'))
  if (columnChildren.length >= 2)
    return

  const hrIndex = children.findIndex(child => child.tagName === 'HR')

  let columns: HTMLElement[][] = []

  if (hrIndex !== -1) {
    columns = [
      children.slice(0, hrIndex) as HTMLElement[],
      children.slice(hrIndex + 1) as HTMLElement[],
    ]
  }
  else {
    // Auto-split on H3/H4 headings.
    let currentColumn: HTMLElement[] = []

    for (const child of children) {
      const isHeading = child.tagName === 'H3' || child.tagName === 'H4'

      if (isHeading && currentColumn.length > 0) {
        columns.push(currentColumn)
        currentColumn = []
      }

      currentColumn.push(child as HTMLElement)
    }

    if (currentColumn.length > 0)
      columns.push(currentColumn)
  }

  if (columns.length < 2)
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
