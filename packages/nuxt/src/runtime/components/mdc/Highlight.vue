<script setup lang="ts">
interface Props {
  /**
   * Text size of the message, a step of the type scale above the body text; without it, the message keeps the size of the body text.
   * @fr Taille du texte du message, un cran de l'échelle typographique au-dessus du texte courant ; sans elle, le message garde la taille du texte courant.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

defineProps<Props>()

defineSlots<{
  /** The message, in markdown. */
  default?: () => unknown
}>()
</script>

<template>
  <!-- A span: `:highlight[…]` sits inside a paragraph, which a div would split. -->
  <span
    class="highlight"
    :class="size && `highlight--${size}`"
  >
    <slot />
  </span>
</template>

<style scoped lang="scss">
.highlight {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  max-width: var(--measure);
  padding-left: 0.8em;
  border-left: 3px solid var(--accent);
  line-height: 1.4;
  font-weight: 700;
  color: var(--accent);
}

.highlight :deep(:is(p, ul, ol)) {
  margin: 0;
  line-height: inherit;
}

.highlight :deep(strong) {
  color: inherit;
}

/* The size applies to the text of the message, so the box keeps the margins
   and the padding of the body text. A larger message takes a tighter leading. */
.highlight--sm > :deep(*) {
  font-size: var(--text-step-1);
}

.highlight--md {
  line-height: 1.35;

  > :deep(*) {
    font-size: var(--text-step-2);
  }
}

.highlight--lg {
  line-height: 1.25;

  > :deep(*) {
    font-size: var(--text-step-3);
  }
}

.highlight--xl {
  line-height: 1.2;

  > :deep(*) {
    font-size: var(--text-step-4);
  }
}

/* In a sentence the highlight is a phrase of the paragraph, in bold and in the
   accent color. */
p > .highlight {
  display: inline;
  max-width: none;
  padding: 0;
  border: 0;
  line-height: inherit;
}

p > .highlight > :deep(*) {
  font-size: inherit;
}
</style>
