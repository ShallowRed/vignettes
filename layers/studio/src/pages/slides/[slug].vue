<script setup lang="ts">
// The layout follows what the page shows: the deck in `presentation`, an error
// screen in `default` (https://nuxt.com/docs/guide/directory-structure/layouts).
definePageMeta({
  layout: false,
})

const { t } = useI18n()
const route = useRoute()
const slug = route.params.slug as string

// `?draft`: an editor previews the working draft the way it will be published.
const draftPreview = 'draft' in route.query
const { presentationData, error } = usePresentation(slug, undefined, { draft: draftPreview })
const { user } = useAppSession()

// The server answers a closed deck three ways: 401 with the `requiresPassword`
// flag (semi-private, ask for the deck password), a plain 401 (private, ask to
// sign in), and 404 (signed in without access, the answer of a slug that does
// not exist). Only the flag sends to the password prompt, which a plain 401
// could never satisfy.
// ofetch nests the server's createError payload under data.data; a direct h3
// error keeps it at data. Read both so the flag survives either transport.
const errorData = computed(() => {
  const err = error.value as any
  return err?.data?.data ?? err?.data
})
const requiresPassword = computed(() => errorData.value?.requiresPassword === true)
const needsLogin = computed(() => !requiresPassword.value && (error.value as any)?.statusCode === 401)
// A deck the actor may not view answers 404 like a deck that does not exist, so
// one screen covers both: naming either case would confirm the slug. The raw
// message of the failed request is left out for the same reason.
const notFound = computed(() => (error.value as any)?.statusCode === 404)
// A closed deck that is not sent to the password prompt shows an error screen.
const errorShown = computed(() => Boolean(error.value) && !requiresPassword.value)

// Whoever may edit a deck that has no published version learns so, with the
// way to its editor and its draft. The viewer route tells the others nothing
// about the deck.
const { data: viewer } = useDeckViewer(slug)
const unpublished = computed(() => notFound.value && viewer.value.canEdit && viewer.value.published === false)

// `replace: true`: this route only ever bounces to /unlock, so keeping it in
// history would trap Back (it re-fires the watch and bounces forward again).
watch(requiresPassword, (needsPassword) => {
  if (needsPassword)
    navigateTo(`/unlock/${slug}?return=/slides/${slug}`, { replace: true })
}, { immediate: true })
</script>

<template>
  <NuxtLayout :name="errorShown ? 'default' : 'presentation'">
    <div
      v-if="!errorShown"
      class="presentation-page"
    >
      <!-- No <ClientOnly>: SSR-safe markup must prerender for the frozen bundle. -->
      <StudioDeck
        v-if="presentationData && presentationData.slides.length > 0"
        :slug="slug"
        :presentation-data="presentationData"
        :draft="draftPreview"
      />
    </div>
    <DeckError
      v-else-if="needsLogin"
      icon="i-lucide-lock"
      :title="t('auth.deckError.privateTitle')"
      :message="t('auth.deckError.privateMessage')"
      :login-redirect="`/slides/${slug}`"
    />
    <ErrorState
      v-else-if="unpublished"
      icon="i-lucide-file-pen-line"
      :title="t('auth.deckError.unpublishedTitle')"
      :description="t('auth.deckError.unpublishedMessage')"
      :actions="[
        { label: t('auth.viewer.openEditor'), icon: 'i-lucide-pencil', to: `/edit/${slug}` },
        { label: t('editor.preview.preview'), icon: 'i-lucide-eye', to: `/slides/${slug}?draft`, external: true, color: 'neutral', variant: 'subtle' },
      ]"
      :back="{ to: '/' }"
    />
    <DeckError
      v-else
      :icon="notFound ? 'i-lucide-file-question' : 'i-lucide-triangle-alert'"
      :title="notFound ? t('auth.deckError.notFoundTitle') : undefined"
      :message="notFound ? t('auth.deckError.notFoundMessage') : undefined"
      :account-login="notFound ? user?.login : undefined"
    />
  </NuxtLayout>
</template>
