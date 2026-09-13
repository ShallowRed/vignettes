<script setup lang="ts">
definePageMeta({
  layout: 'presentation',
})

const route = useRoute()
const slug = route.params.slug as string

// `?draft`: an editor previews the working draft the way it will be published.
const draftPreview = 'draft' in route.query
const { presentationData, error } = usePresentation(slug, undefined, { draft: draftPreview })
const { user } = useAppSession()

// The server distinguishes the three closed doors: 401 + requiresPassword flag
// (semi-private, ask for the deck password), plain 401 (private, ask to sign
// in), 403 (signed in but not granted). Only the flag decides the unlock
// bounce — a plain 401 must NOT land on a password prompt it can never satisfy.
// ofetch nests the server's createError payload under data.data; a direct h3
// error keeps it at data. Read both so the flag survives either transport.
const errorData = computed(() => {
  const err = error.value as any
  return err?.data?.data ?? err?.data
})
const requiresPassword = computed(() => errorData.value?.requiresPassword === true)
const needsLogin = computed(() => !requiresPassword.value && (error.value as any)?.statusCode === 401)
const forbidden = computed(() => (error.value as any)?.statusCode === 403)

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
      <StudioDeck
        :slug="slug"
        :presentation-data="presentationData"
        :draft="draftPreview"
      />
    </template>

    <DeckError
      v-else-if="needsLogin"
      title="Présentation privée"
      message="Connectez-vous avec le compte auquel elle a été partagée."
      :login-redirect="`/slides/${slug}`"
    />
    <DeckError
      v-else-if="forbidden"
      title="Accès refusé"
      message="Votre compte n'a pas accès à cette présentation."
      :account-login="user?.login"
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
