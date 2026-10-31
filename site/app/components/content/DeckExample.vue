<script setup lang="ts">
// `::deck-example` in a page shows a live deck. The deck is the markdown code
// block the component wraps, shown under it unless `hide-source` is set, or a
// deck of the repository's `examples/` named by `example`.
const props = defineProps<{
  example?: string
  hideSource?: boolean
}>()

const examples = import.meta.glob<string>('../../../../examples/*.md', { query: '?raw', import: 'default', eager: true })

const exampleSource = computed(() => props.example ? examples[`../../../../examples/${props.example}.md`] : undefined)
</script>

<template>
  <div class="deck-example">
    <DeckLive
      v-if="exampleSource ?? codeOf($slots.default?.())"
      :source="(exampleSource ?? codeOf($slots.default?.()))!"
    />
    <slot v-if="!hideSource" />
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
