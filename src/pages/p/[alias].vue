<script setup lang="ts">
definePageMeta({
  layout: 'presentation',
})

const route = useRoute()
const alias = route.params.alias as string

// Frozen/archived aliases redirect to their static bundle; live ones render here.
const { data: resolved, error: resolveError } = await useAsyncData(`p-resolve-${alias}`, () =>
  $fetch<{ lifecycle: string, frozenUrl?: string }>(`/api/p/${alias}`))

if (resolved.value?.frozenUrl) {
  await navigateTo(resolved.value.frozenUrl, { external: true, redirectCode: 302 })
}

const { presentationData, error: loadError } = usePresentation(`p-${alias}`, `/api/p/${alias}`)

const error = computed(() => resolveError.value || loadError.value)
const requiresPassword = computed(() => {
  const err = error.value as any
  return !!(err && (err.data?.requiresPassword || err.statusCode === 401))
})

watch(requiresPassword, (needsPassword) => {
  if (needsPassword) {
    const api = encodeURIComponent(`/api/p/${alias}`)
    const ret = encodeURIComponent(`/p/${alias}`)
    navigateTo(`/unlock/${alias}?api=${api}&return=${ret}`)
  }
}, { immediate: true })
</script>

<template>
  <div class="presentation-page">
    <!-- No <ClientOnly>: SSR-safe markup must prerender for the frozen bundle. -->
    <template v-if="presentationData && presentationData.slides.length > 0">
      <RevealPresentation
        :theme="presentationData.metadata.theme"
        :config="presentationData.metadata.reveal"
      >
        <RevealSlides :presentation-data="presentationData" />
      </RevealPresentation>
    </template>

    <DeckError
      v-else-if="error && !requiresPassword"
      :message="error.message"
    />
  </div>
</template>

<style scoped>
.presentation-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
