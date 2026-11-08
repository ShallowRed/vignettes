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

const { needsLogin, notFound, errorShown } = useClosedDeck(error, `/unlock/${slug}?return=/slides/${slug}`)

// Whoever may edit a deck that has no published version learns so, with the
// way to its editor and its draft. The viewer route tells the others nothing
// about the deck.
const { data: viewer } = useDeckViewer(slug)
const unpublished = computed(() => notFound.value && viewer.value.canEdit && viewer.value.published === false)
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
