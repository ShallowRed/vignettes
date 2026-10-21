<script setup lang="ts">
export interface Fact {
  key: string
  text: string
  icon?: string
  /** Tooltip of the fact, when its text alone is a number. */
  title?: string
  warning?: boolean
}

// Short facts on one line, separated by « · », which screen readers skip.
defineProps<{ facts: Fact[] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
    <template
      v-for="(fact, index) in facts"
      :key="fact.key"
    >
      <span
        v-if="index"
        aria-hidden="true"
      >·</span>
      <span
        :class="{ 'text-warning': fact.warning, 'inline-flex items-center gap-0.5': fact.icon }"
        :title="fact.title"
      >
        <UIcon
          v-if="fact.icon"
          :name="fact.icon"
          class="size-3"
        />
        {{ fact.text }}
      </span>
    </template>
  </div>
</template>
