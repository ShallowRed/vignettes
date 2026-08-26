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
// Same three closed doors as /slides/<slug>: only the explicit server flag
// bounces to the password prompt; a plain 401 asks to sign in instead.
const requiresPassword = computed(() => (error.value as any)?.data?.requiresPassword === true)
const needsLogin = computed(() => !requiresPassword.value && (error.value as any)?.statusCode === 401)
const forbidden = computed(() => (error.value as any)?.statusCode === 403)

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
      v-else-if="needsLogin"
      title="Présentation privée"
      message="Connectez-vous avec le compte auquel elle a été partagée."
      :login-redirect="`/p/${alias}`"
    />
    <DeckError
      v-else-if="forbidden"
      title="Accès refusé"
      message="Votre compte n'a pas accès à cette présentation."
    />
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
