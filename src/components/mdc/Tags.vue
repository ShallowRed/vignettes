<script setup lang="ts">
import { computed } from 'vue'

// A row of qualified tags « axis : value », the way the registry labels a rule,
// listing the values an axis can take. `values="référencée:grey,exécutable:green"`.
interface Props {
  axis: string
  values: string
  /** Text shown for the axis; defaults to the axis name itself. */
  label?: string
  /** The value to keep at full strength; the other tags of the row fade. */
  active?: string
  /** Axis name above the tags instead of beside them (narrow columns). */
  stack?: boolean
  /** The label, then each tag, as Reveal fragments in that order. */
  fragments?: boolean
}

const props = defineProps<Props>()

const tags = computed(() => props.values.split(',').map((entry) => {
  const [value, tone] = entry.split(':').map(v => v.trim())
  return { value, tone: tone || 'neutral' }
}))
</script>

<template>
  <div
    class="tags"
    :class="{ 'tags--stack': stack }"
  >
    <div class="tags__row">
      <span
        class="tags__axis"
        :class="{ fragment: fragments }"
      >{{ label ?? axis }}</span>
      <span
        v-for="t in tags"
        :key="t.value"
        class="qtag"
        :class="[`qtag--${t.tone}`, { 'fragment': fragments, 'qtag--faded': active && t.value !== active, 'qtag--active': active && t.value === active }]"
      >
        <span class="qtag__axis">{{ axis }}</span>
        <span class="qtag__value">{{ t.value }}</span>
      </span>
    </div>
    <div class="tags__text">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tags {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  margin: 0 0 1.4em;
}

.tags__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6em;
}

.tags__axis {
  flex: 0 0 7em;
  font-weight: 700;
  color: var(--text-title, #161616);
}

.qtag {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
  padding: 0.2em 0.75em;
  border: 1px solid;
  border-radius: 4px;
  font-size: 0.9em;
  line-height: 1.3;
  white-space: nowrap;
}

.qtag__axis {
  opacity: 0.6;
}

.qtag__value {
  font-weight: 600;
}

.qtag--neutral { background: #f3f4f6; color: #1f2937; border-color: #e5e7eb; }
.qtag--green { background: #e3fce5; color: #18753c; border-color: #c4f5cc; }
.qtag--blue { background: #e8edff; color: #0063cb; border-color: #cad8ff; }
.qtag--purple { background: #f3e8ff; color: #6e2caf; border-color: #e9d4ff; }
.qtag--yellow { background: #fef3d8; color: #716043; border-color: #fbe2a8; }
.qtag--grey { background: #f3f4f6; color: #4b5563; border-color: #e5e7eb; }

.qtag--faded {
  opacity: 0.4;
}

.qtag--active {
  box-shadow: 0 0 0 2px var(--accent, #000091);
}

.tags__text {
  margin-left: 7.6em;
  font-size: 0.85em;
  color: var(--text-mention, #666);
}

.tags__text:empty {
  display: none;
}

.tags--stack .tags__axis {
  flex: 0 0 100%;
  margin-bottom: 0.1em;
}

.tags--stack .tags__text {
  margin-left: 0;
}

.tags__text :deep(p) {
  margin: 0;
}
</style>
