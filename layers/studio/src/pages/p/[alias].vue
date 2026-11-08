<script setup lang="ts">
// The layout follows what the page shows: the deck in `presentation`, an error
// screen in `default` (https://nuxt.com/docs/guide/directory-structure/layouts).
definePageMeta({
  layout: false,
})

const { t } = useI18n()
const route = useRoute()
const alias = route.params.alias as string

// Frozen/archived aliases redirect to their static bundle; live ones render here.
// The request carries the cookies of the visitor, as on `/slides/<slug>`.
const requestFetch = useRequestFetch()
const { data: resolved, error: resolveError } = await useAsyncData(`p-resolve-${alias}`, () =>
  requestFetch<{ lifecycle: string, slug?: string, frozenUrl?: string }>(`/api/p/${alias}`))

if (resolved.value?.frozenUrl) {
  await navigateTo(resolved.value.frozenUrl, { external: true, redirectCode: 302 })
}

const { presentationData, error: loadError } = usePresentation(`p-${alias}`, `/api/p/${alias}`)
const { user } = useAppSession()

const error = computed(() => resolveError.value || loadError.value)
const unlockPath = `/unlock/${alias}?api=${encodeURIComponent(`/api/p/${alias}`)}&return=${encodeURIComponent(`/p/${alias}`)}`
const { needsLogin, notFound, errorShown } = useClosedDeck(error, unlockPath)
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
        :slug="resolved?.slug"
        :presentation-data="presentationData"
      />
    </div>
    <DeckError
      v-else-if="needsLogin"
      icon="i-lucide-lock"
      :title="t('auth.deckError.privateTitle')"
      :message="t('auth.deckError.privateMessage')"
      :login-redirect="`/p/${alias}`"
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
