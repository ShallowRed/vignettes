<script setup lang="ts">
import { safeRedirectPath } from '#shared/access'

definePageMeta({
  layout: false,
})

const { t } = useI18n()
const route = useRoute()
const error = computed(() => route.query.error as string | undefined)

// Carry the intended destination across the OAuth round-trip: stash it in a
// short-lived cookie the GitHub onSuccess handler reads to redirect back.
const redirectCookie = useCookie('auth_redirect', { maxAge: 600, sameSite: 'lax' })
const redirect = computed(() => route.query.redirect ? safeRedirectPath(route.query.redirect) : undefined)
onMounted(() => {
  if (redirect.value)
    redirectCookie.value = redirect.value
})

const errorMessage = computed(() => {
  switch (error.value) {
    case 'oauth_failed':
      return t('auth.login.oauthFailed')
    default:
      return error.value ? t('auth.login.genericError') : ''
  }
})

// Only offer the providers this deployment holds credentials for.
const { data: providers } = await useFetch('/api/auth/providers')
const noProvider = computed(() => providers.value && !providers.value.github && !providers.value.google)

// Dev-only shortcut: GitHub OAuth needs secrets + a network round-trip, so local
// iteration on gated features logs in as a synthetic per-role account instead.
// `import.meta.dev` is a build constant → this block is stripped from production.
const isDev = import.meta.dev
const devRedirect = computed(() => redirect.value ? `&redirect=${encodeURIComponent(redirect.value)}` : '')
const devRoles = computed(() => [
  { role: 'owner', label: t('common.role.owner'), icon: 'i-lucide-shield' },
  { role: 'editor', label: t('common.role.editor'), icon: 'i-lucide-pencil' },
  { role: 'viewer', label: t('common.role.viewer'), icon: 'i-lucide-eye' },
])
</script>

<template>
  <div class="tailwind-app min-h-dvh bg-muted flex items-center justify-center p-8">
    <UCard
      class="w-full max-w-md"
      :ui="{ root: 'ring-0 border-0 shadow-lg' }"
    >
      <div class="flex flex-col items-center text-center gap-2">
        <div class="grid place-items-center size-14 rounded-2xl bg-primary/10 text-primary mb-1">
          <VignettesMark class="w-9" />
        </div>
        <h1 class="text-2xl font-bold text-highlighted">
          Vignettes
        </h1>
        <p class="text-muted mb-4">
          {{ t('auth.login.tagline') }}
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="errorMessage"
          class="mb-2 text-left"
        />

        <ActionNotice
          v-if="noProvider"
          :title="t('auth.login.noProviderTitle')"
          :description="t('auth.login.noProviderDescription')"
          icon="i-lucide-key-round"
          class="w-full text-left"
        />

        <UButton
          v-if="providers?.github"
          to="/auth/github"
          external
          icon="i-lucide-github"
          :label="t('auth.login.withGithub')"
          color="neutral"
          size="lg"
          block
        />

        <UButton
          v-if="providers?.google"
          to="/auth/google"
          external
          icon="i-ri-google-fill"
          :label="t('auth.login.withGoogle')"
          color="neutral"
          size="lg"
          block
        />
        <p
          v-if="providers?.google"
          class="text-xs text-muted text-left"
        >
          {{ t('auth.login.sharedAccessHint') }}
        </p>

        <template v-if="isDev">
          <USeparator
            label="dev"
            class="my-3"
          />
          <div class="w-full rounded-lg border border-dashed border-warning/40 bg-warning/5 p-3">
            <p class="text-xs text-muted mb-2 flex items-center gap-1.5">
              <UIcon
                name="i-lucide-flask-conical"
                class="size-3.5 text-warning"
              />
              {{ t('auth.login.devLogin') }}
            </p>
            <div class="flex gap-2">
              <UButton
                v-for="entry in devRoles"
                :key="entry.role"
                :to="`/auth/dev-login?role=${entry.role}${devRedirect}`"
                external
                :icon="entry.icon"
                :label="entry.label"
                color="neutral"
                variant="subtle"
                size="sm"
                block
              />
            </div>
          </div>
        </template>

        <USeparator
          :label="t('common.or')"
          class="my-3"
        />

        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          :label="t('common.actions.backToDecks')"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </div>
    </UCard>
  </div>
</template>
