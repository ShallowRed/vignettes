<script setup lang="ts">
/**
 * Inline icon component for MDC markdown.
 * Usage in markdown: :icon-inline{name="ri:home-line"}
 *
 * Remix Icons prefix: ri
 * Browse icons at: https://remixicon.com/ or https://icon-sets.iconify.design/ri/
 */
interface Props {
  name: string
  size?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  size: '1.2em',
})
</script>

<template>
  <span class="inline-icon-wrapper">
    <Icon
      :name="props.name"
      :size="String(props.size)"
    />
  </span>
</template>

<style scoped>
.inline-icon-wrapper {
  display: inline-flex;
  align-items: center;
  vertical-align: -0.125em;
}
</style>
