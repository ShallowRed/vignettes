<script setup lang="ts">
// `::deck-playground` in a page shows the markdown code block it wraps as an
// editable text beside its live deck. The deck renders the text once the typing
// pauses and shows the slide of the line under the caret.
const slots = useSlots()
const initial = codeOf(slots.default?.()) ?? ''

const text = ref(initial)
const source = ref(initial)
const line = ref(1)

let timer: ReturnType<typeof setTimeout> | undefined
watch(text, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => (source.value = value), 300)
})
onBeforeUnmount(() => clearTimeout(timer))

function readCaret(event: Event) {
  const area = event.target as HTMLTextAreaElement
  line.value = area.value.slice(0, area.selectionStart).split('\n').length
}
</script>

<template>
  <div class="deck-playground">
    <textarea
      v-model="text"
      class="deck-playground__source"
      aria-label="Texte de la présentation"
      spellcheck="false"
      wrap="off"
      autocapitalize="off"
      @keyup="readCaret"
      @click="readCaret"
      @focus="readCaret"
    />
    <DeckLive
      class="deck-playground__deck"
      :source="source"
      :line="line"
    />
  </div>
</template>

<style scoped>
.deck-playground {
  display: grid;
  gap: 1rem;
}

.deck-playground__source {
  height: 18rem;
  padding: 1rem;
  resize: none;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  color: var(--ui-text);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  tab-size: 2;
}

.deck-playground__source:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

/* On a phone the slide comes first, and the text under it. */
.deck-playground__deck {
  order: -1;
}

@media (min-width: 1024px) {
  .deck-playground {
    grid-template-columns: 2fr 3fr;
  }

  /* The text is as tall as the slide beside it. */
  .deck-playground__source {
    height: auto;
  }

  .deck-playground__deck {
    order: 0;
  }
}
</style>
