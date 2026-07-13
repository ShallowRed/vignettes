<script setup lang="ts">
import type { RevealConfig } from '~/types/presentation'
import { mergeRevealConfig } from '#shared/render'
import 'reveal.js/dist/reveal.css'

interface Props {
  theme?: string
  config?: Partial<RevealConfig>
}

const props = withDefaults(defineProps<Props>(), {
  theme: 'dsfr',
})

const revealContainer = ref<HTMLElement | null>(null)

// Serialised onto `.reveal` so the frozen prerendered bundle can init Reveal with
// the deck's frontmatter `reveal:` config, not just defaults. DDR-017 §2.a-ter.
const resolvedRevealConfig = computed(() =>
  JSON.stringify(mergeRevealConfig(props.config)))

const { loadTheme, unloadTheme, watchTheme } = useTheme(toRef(props, 'theme'))

const { initialize, destroy, getInstance, sync } = useReveal(revealContainer, props.config || {})

// Let MDC components trigger a Reveal sync after dynamic content changes.
provide('revealSync', sync)
provide('revealInstance', getInstance)

// Translate markdown anchor clicks (href="#slug") into Reveal hash navigation (#/slug).
function handleAnchorClick(event: MouseEvent) {
  const link = (event.target as Element).closest('a[href^="#"]')
  if (!link)
    return
  const href = link.getAttribute('href')
  if (!href || href === '#')
    return
  const slug = href.slice(1)
  const target = revealContainer.value?.querySelector(`section[id="${CSS.escape(slug)}"]`)
  if (!target)
    return
  event.preventDefault()
  window.location.hash = `/${slug}`
}

onMounted(async () => {
  loadTheme(props.theme)
  watchTheme()
  await initialize()
  revealContainer.value?.addEventListener('click', handleAnchorClick)
})

onUnmounted(() => {
  revealContainer.value?.removeEventListener('click', handleAnchorClick)
  destroy()
  unloadTheme()
})
</script>

<template>
  <div
    ref="revealContainer"
    v-french-typography
    class="reveal"
    :data-reveal-config="resolvedRevealConfig"
  >
    <div class="slides">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.reveal {
  width: 100%;
  height: 100vh;
}
</style>
