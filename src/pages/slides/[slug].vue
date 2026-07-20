<script setup lang="ts">
definePageMeta({
  layout: 'presentation',
})

const route = useRoute()
const slug = route.params.slug as string

const { presentationData, error } = usePresentation(slug)

const requiresPassword = computed(() => {
  if (!error.value)
    return false
  const err = error.value as any
  return err?.data?.requiresPassword
    || err?.statusCode === 401
    || err?.message?.includes('Password required')
    || err?.message?.includes('401')
})

// `replace: true`: this route only ever bounces to /unlock, so keeping it in
// history would trap Back (it re-fires the watch and bounces forward again).
watch(requiresPassword, (needsPassword) => {
  if (needsPassword)
    navigateTo(`/unlock/${slug}?return=/slides/${slug}`, { replace: true })
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
