<script setup lang="ts">
import type { NuxtError } from '#app'
import { loginHref } from '#shared/access'

/**
 * The page Nuxt renders when a request fails outside a page's own handling: a
 * wrong URL, a deck the actor may not open, a server error. Deck pages keep
 * their own texts (`DeckError`), which say more about access, on the same
 * `ErrorState`.
 */
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const route = useRoute()
const known = computed(() => [401, 403, 404].includes(props.error.statusCode) ? String(props.error.statusCode) : 'other')
const title = computed(() => t(`common.error.${known.value}.title`))
const description = computed(() => t(`common.error.${known.value}.description`))
</script>

<template>
  <NuxtLayout name="default">
    <ErrorState
      :icon="error.statusCode === 404 ? 'i-lucide-file-question' : 'i-lucide-triangle-alert'"
      :title="title"
      :description="description"
      :actions="error.statusCode === 401 ? [{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: loginHref(route.fullPath) }] : []"
      :back="{ onClick: () => clearError({ redirect: '/' }) }"
    >
      <p class="text-xs text-dimmed">
        {{ error.statusCode }}
      </p>
    </ErrorState>
  </NuxtLayout>
</template>
