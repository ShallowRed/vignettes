<script setup lang="ts">
// normalizeIconName accepts both Iconify (`ri:home-line`) and Remix CSS-class (`ri-home-line`) forms.
import { normalizeIconName } from '@vignettes/core/deck'

interface Props {
  name: string
  size?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  size: '1.2em',
})

const iconName = computed(() => normalizeIconName(props.name))
</script>

<template>
  <Icon
    :name="iconName"
    :size="String(props.size)"
    class="inline-icon"
    mode="svg"
  />
</template>

<style scoped>
.inline-icon {
  display: inline;
  width: .85em;
  height: .85em;
  vertical-align: -0.125em;
}
</style>
