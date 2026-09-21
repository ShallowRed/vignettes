<script setup lang="ts">
definePageMeta({
  layout: 'presentation',
})

const { t } = useI18n()
const route = useRoute()
const alias = route.params.alias as string

// Frozen/archived aliases redirect to their static bundle; live ones render here.
const { data: resolved, error: resolveError } = await useAsyncData(`p-resolve-${alias}`, () =>
  $fetch<{ lifecycle: string, slug?: string, frozenUrl?: string }>(`/api/p/${alias}`))

if (resolved.value?.frozenUrl) {
  await navigateTo(resolved.value.frozenUrl, { external: true, redirectCode: 302 })
}

const { presentationData, error: loadError } = usePresentation(`p-${alias}`, `/api/p/${alias}`)
const { user } = useAppSession()

const error = computed(() => resolveError.value || loadError.value)
// The same three answers as `/slides/<slug>`: only the `requiresPassword` flag
// sends to the password prompt, and a plain 401 asks to sign in.
// ofetch nests the server's createError payload under data.data; a direct h3
// error keeps it at data. Read both so the flag survives either transport.
const errorData = computed(() => {
  const err = error.value as any
  return err?.data?.data ?? err?.data
})
const requiresPassword = computed(() => errorData.value?.requiresPassword === true)
const needsLogin = computed(() => !requiresPassword.value && (error.value as any)?.statusCode === 401)
// A deck the actor may not view answers 404 like a deck that does not exist, so
// one screen covers both: naming either case would confirm the alias.
const notFound = computed(() => (error.value as any)?.statusCode === 404)

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
      <StudioDeck
        :slug="resolved?.slug"
        :presentation-data="presentationData"
      />
    </template>

    <DeckError
      v-else-if="needsLogin"
      :title="t('auth.deckError.privateTitle')"
      :message="t('auth.deckError.privateMessage')"
      :login-redirect="`/p/${alias}`"
    />
    <DeckError
      v-else-if="error && !requiresPassword"
      :title="notFound ? t('auth.deckError.notFoundTitle') : undefined"
      :message="notFound ? t('auth.deckError.notFoundMessage') : undefined"
      :account-login="notFound ? user?.login : undefined"
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
