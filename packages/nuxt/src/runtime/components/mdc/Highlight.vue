<script setup lang="ts">
interface Props {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'accent' | 'contrast'
  center?: boolean
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  variant: 'default',
  center: false,
})
</script>

<template>
  <!-- A span: `:highlight[…]` sits inside a paragraph, which a div would split. -->
  <span
    class="highlight"
    :class="[
      `highlight--${size}`,
      `highlight--${variant}`,
      { 'highlight--center': center },
    ]"
  >
    <slot />
  </span>
</template>

<style scoped lang="scss">
.highlight {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4em;
  line-height: 1.3;
  font-weight: 400;
}

.highlight--center {
  text-align: center;
  align-items: center;
}

.highlight--sm {
  font-size: 1.3em;
  max-width: 50ch;
  &:deep(p, ul) {
    line-height: 1.5;
  }
}

.highlight--md {
  font-size: 1.6em;
  max-width: 45ch;
  &:deep(p, ul) {
    line-height: 1.7;
  }
}

.highlight--lg {
  font-size: 2em;
  max-width: 40ch;
  &:deep(p, ul) {
    line-height: 1.7;
  }
}

.highlight--xl {
  font-size: 2.6em;
  max-width: 30ch;
  &:deep(p, ul) {
    line-height: 1.7;
  }
}

.highlight--accent {
  border-left: 4px solid var(--accent, #000091);
  background: var(--accent-bg, #f5f5fe);
  --text-title: var(--on-surface-title);
  --text-default: var(--on-surface-default);
  --text-mention: var(--on-surface-mention);
  color: var(--text-default);
  padding: 1em 1.4em;
  border-radius: 0 var(--radius, 6px) var(--radius, 6px) 0;
  text-align: left;
}

.highlight--accent.highlight--center {
  text-align: left;
}

.highlight--contrast {
  background: var(--surface-contrast, #161616);
  color: var(--on-contrast, #ffffff);
  padding: 1.2em 1.6em;
  border-radius: var(--radius, 6px);
}

.highlight :deep(strong) {
  color: var(--accent, #000091);
}

.highlight--contrast :deep(strong) {
  color: var(--accent-soft, #e3e3fd);
}

.highlight :deep(em) {
  font-style: normal;
  text-decoration: underline;
  text-decoration-color: var(--accent, #000091);
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
}

.highlight--contrast :deep(em) {
  text-decoration-color: var(--accent-soft, #e3e3fd);
}
/* In a sentence the highlight is a phrase of the paragraph, in the accent color. */
p > .highlight {
  display: inline;
  max-width: none;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  font-size: inherit;
  line-height: inherit;
  font-weight: 700;
  color: var(--accent, #000091);
}
</style>
