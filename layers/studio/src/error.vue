<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * The page Nuxt renders when a request fails outside a page's own handling: a
 * wrong URL, a deck the actor may not open, a server error. Deck pages keep
 * their own screens (`DeckError`), which say more about access.
 */
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const known = computed(() => [401, 403, 404].includes(props.error.statusCode) ? String(props.error.statusCode) : 'other')
const title = computed(() => t(`common.error.${known.value}.title`))
const description = computed(() => t(`common.error.${known.value}.description`))
</script>

<template>
  <div class="tailwind-app min-h-dvh bg-muted">
    <AppHeader />
    <UMain>
      <UContainer class="py-16">
        <UEmpty
          :icon="error.statusCode === 404 ? 'i-lucide-file-question' : 'i-lucide-triangle-alert'"
          :title="title"
          :description="description"
          variant="naked"
          size="lg"
          :actions="[
            { label: t('common.home'), icon: 'i-lucide-arrow-left', onSelect: () => clearError({ redirect: '/' }) },
            ...(error.statusCode === 401 ? [{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: '/login', color: 'neutral' as const, variant: 'subtle' as const }] : []),
          ]"
        />
        <p class="mt-6 text-center text-xs text-dimmed">
          {{ error.statusCode }}
        </p>
      </UContainer>
    </UMain>
  </div>
</template>
