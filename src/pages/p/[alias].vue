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

const editUrl = computed(() => presentationData.value?.editUrl || null)

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

      <a
        v-if="editUrl"
        :href="editUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="codimd-edit-link"
        title="Edit collaboratively"
      >
        Edit
      </a>
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

.codimd-edit-link {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
  padding: 0.4rem 0.8rem;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  text-decoration: none;
  opacity: 0.3;
  transition: opacity 0.2s;
}

.codimd-edit-link:hover {
  opacity: 1;
}
</style>
