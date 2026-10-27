<script setup lang="ts">
// normalizeIconName accepts both Iconify (`ri:home-line`) and Remix CSS-class (`ri-home-line`) forms.
import { normalizeIconName } from '@vignettes/core/deck'
import { computed } from 'vue'

interface Props {
  /**
   * Iconify name of the icon, `ri:home-line`; the Remix class `ri-home-line` works too.
   * @fr Nom Iconify de l'icône, `ri:home-line` ; la classe Remix `ri-home-line` fonctionne aussi.
   */
  name: string
  /**
   * CSS size of the icon.
   * @fr Taille CSS de l'icône.
   */
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
