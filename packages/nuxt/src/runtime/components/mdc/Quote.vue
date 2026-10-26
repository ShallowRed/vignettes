<script setup lang="ts">
interface Props {
  /** Name of the person quoted. */
  author?: string
  /** Role of the person quoted, under the name. */
  role?: string
  /** Address of a portrait beside the name. */
  avatar?: string
}

const props = defineProps<Props>()

defineSlots<{
  /** The quote, in markdown. */
  default?: () => unknown
}>()
</script>

<template>
  <blockquote class="quote">
    <div class="quote-content">
      <slot />
    </div>
    <footer
      v-if="props.author"
      class="quote-footer"
    >
      <img
        v-if="props.avatar"
        :src="props.avatar"
        :alt="props.author"
        class="quote-avatar"
      >
      <div class="quote-attribution">
        <cite class="quote-author">{{ props.author }}</cite>
        <span
          v-if="props.role"
          class="quote-role"
        >{{ props.role }}</span>
      </div>
    </footer>
  </blockquote>
</template>

<style scoped>
/* After the DSFR quote: an opening mark in the accent color, the words in bold,
   the author and a role under them, a short rule to close. The theme's rule for
   markdown blockquotes is reset here. */
.quote {
  position: relative;
  width: auto;
  margin: 1.5em 0;
  padding: 0 0 1.25em;
  border: 0;
  background: none;
  font-style: normal;
  color: var(--text-title, #161616);
}

/* Remix Icon `double-quotes-l`. */
.quote::before {
  content: '';
  display: block;
  width: 1.6em;
  height: 1.6em;
  margin-bottom: 0.3em;
  background: var(--accent, #000091);
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621c.537-.278 1.24-.375 1.929-.311c1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5a3.87 3.87 0 0 1-2.748-1.179m10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621c.537-.278 1.24-.375 1.929-.311c1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5a3.87 3.87 0 0 1-2.748-1.179'/%3E%3C/svg%3E") center / contain no-repeat;
}

.quote::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 50%;
  border-bottom: 1px solid var(--border, #e0e0e0);
}

.quote-content {
  font-size: 1.15em;
  font-weight: 700;
  line-height: 1.45;
}

.quote-content :deep(p) {
  margin: 0;
}

.quote-footer {
  display: flex;
  align-items: center;
  gap: 0.75em;
  margin-top: 1em;
}

.quote-avatar {
  width: 2.5em;
  height: 2.5em;
  border-radius: 50%;
  object-fit: cover;
}

.quote-attribution {
  display: flex;
  flex-direction: column;
  gap: 0.1em;
}

.quote-author {
  font-style: normal;
  font-weight: 700;
  font-size: 0.8em;
  color: var(--text-title, #161616);
}

.quote-role {
  font-size: 0.7em;
  color: var(--text-mention, #6b6b6b);
}
</style>
