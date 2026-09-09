<script setup lang="ts">
import { computed } from 'vue'

// A rule as the registry lists it: producer and domain, title, description, and
// its qualified tags stacked on the right. `tags="règle:exécutable:green,…"`.
interface Props {
  producer?: string
  domain?: string
  title: string
  tags?: string
  meta?: string
}

const props = defineProps<Props>()

const tagList = computed(() => (props.tags ?? '').split(',').map(v => v.trim()).filter(Boolean).map((entry) => {
  const [axis, value, tone] = entry.split(':').map(v => v.trim())
  return { axis, value, tone: tone || 'neutral' }
}))
</script>

<template>
  <article class="rule-card">
    <div class="rule-card__body">
      <p class="rule-card__producer">
        <span>{{ producer }}</span>
        <span
          v-if="domain"
          class="rule-card__domain"
        >{{ domain }}</span>
      </p>
      <p class="rule-card__title">
        {{ title }}
      </p>
      <div class="rule-card__text">
        <slot />
      </div>
      <p
        v-if="meta"
        class="rule-card__meta"
      >
        {{ meta }}
      </p>
    </div>
    <ul class="rule-card__tags">
      <li
        v-for="t in tagList"
        :key="t.axis"
        class="qtag"
        :class="`qtag--${t.tone}`"
      >
        <span class="qtag__axis">{{ t.axis }}</span>
        <span class="qtag__value">{{ t.value }}</span>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.rule-card {
  display: flex;
  gap: 1.2em;
  padding: 1em 1.2em;
  background: var(--surface, #fff);
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 145, 0.08);
  text-align: left;
}

.rule-card__body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}

.rule-card__producer {
  margin: 0;
  display: flex;
  gap: 0.8em;
  font-size: 0.6em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-mention, #666);
}

.rule-card__domain {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.rule-card__title {
  margin: 0;
  font-size: 0.95em;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-title, #161616);
}

.rule-card__text {
  font-size: 0.7em;
  line-height: 1.4;
  color: var(--text-default, #161616);
}

.rule-card__text :deep(p) {
  margin: 0;
}

.rule-card__meta {
  margin: 0.2em 0 0;
  font-size: 0.6em;
  color: var(--text-mention, #666);
}

.rule-card__tags {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45em;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rule-card__tags li {
  padding-left: 0;
}

.rule-card__tags li::before {
  content: none;
}

.qtag {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
  padding: 0.15em 0.6em;
  border: 1px solid;
  border-radius: 4px;
  font-size: 0.65em;
  line-height: 1.3;
  white-space: nowrap;
}

.qtag__axis { opacity: 0.6; }
.qtag__value { font-weight: 600; }
.qtag--neutral { background: #f3f4f6; color: #1f2937; border-color: #e5e7eb; }
.qtag--green { background: #e3fce5; color: #18753c; border-color: #c4f5cc; }
.qtag--blue { background: #e8edff; color: #0063cb; border-color: #cad8ff; }
.qtag--purple { background: #f3e8ff; color: #6e2caf; border-color: #e9d4ff; }
.qtag--yellow { background: #fef3d8; color: #716043; border-color: #fbe2a8; }
.qtag--grey { background: #f3f4f6; color: #4b5563; border-color: #e5e7eb; }
</style>
