<script setup lang="ts">
import type { VNode } from 'vue'

// `::deck-example` in a page shows a live deck. The deck is the markdown code
// block the component wraps, shown under it, or a deck of the repository's
// `examples/` named by `example`.
const props = defineProps<{
  example?: string
}>()

const examples = import.meta.glob<string>('../../../../examples/*.md', { query: '?raw', import: 'default', eager: true })

const exampleSource = computed(() => props.example ? examples[`../../../../examples/${props.example}.md`] : undefined)

// A code block renders as `ProsePre`, which receives the raw text as `code`.
function codeOf(nodes: VNode[] | undefined): string | undefined {
  for (const node of nodes ?? []) {
    const code = (node.props as { code?: unknown } | null)?.code
    if (typeof code === 'string')
      return code
    if (Array.isArray(node.children)) {
      const nested = codeOf(node.children as VNode[])
      if (nested)
        return nested
    }
  }
  return undefined
}
</script>

<template>
  <div class="deck-example">
    <DeckLive
      v-if="exampleSource ?? codeOf($slots.default?.())"
      :source="(exampleSource ?? codeOf($slots.default?.()))!"
    />
    <slot />
  </div>
</template>

<style scoped>
.deck-example {
  margin-block: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.deck-example :deep(pre) {
  margin-block: 0;
}
</style>
