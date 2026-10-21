<script setup lang="ts">
import { safeRedirectPath } from '#shared/access'

definePageMeta({
  layout: false,
})

const { t } = useI18n()
const route = useRoute()
const slug = computed(() => route.params.slug as string)

// Query params from the redirecting deck page (both optional, default to the
// slides route): `api` = endpoint of the deck, whose `/unlock` route verifies
// the password and sets the access cookie, `return` = URL to send the user back
// to once unlocked.
const verifyApi = computed(() => {
  const api = route.query.api as string | undefined
  return api && api.startsWith('/api/') ? api : `/api/presentations/${slug.value}`
})
const returnTo = computed(() => safeRedirectPath(route.query.return, `/slides/${slug.value}`))

const password = ref('')
const errorMessage = ref('')
const loading = ref(false)

async function unlock() {
  loading.value = true
  errorMessage.value = ''

  try {
    await $fetch(`${verifyApi.value}/unlock`, { method: 'POST', body: { password: password.value } })
    // `replace: true`: drop /unlock from history so Back skips it (the cookie is
    // now set, so returning here would just re-redirect to the deck).
    await navigateTo(returnTo.value, { replace: true })
  }
  catch (e: any) {
    // The form only submits a password, so a refusal is that password. The raw
    // message of the request stays out: it names the route and the slug.
    if (e.statusCode === 401)
      errorMessage.value = t('auth.unlock.wrongPassword')
    else if (e.statusCode === 429)
      errorMessage.value = t('auth.unlock.tooManyAttempts')
    else
      errorMessage.value = t('auth.unlock.genericError')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="tailwind-app min-h-dvh bg-muted flex items-center justify-center p-8">
    <UCard
      class="w-full max-w-md"
      :ui="{ root: 'ring-0 border-0 shadow-lg' }"
    >
      <div class="flex flex-col gap-2">
        <div class="grid place-items-center size-14 rounded-2xl bg-warning/15 text-warning mb-2">
          <UIcon
            name="i-lucide-lock-keyhole"
            class="size-7"
          />
        </div>
        <h1 class="text-xl font-bold text-highlighted">
          {{ t('auth.unlock.title') }}
        </h1>
        <p class="text-muted mb-4">
          {{ t('auth.unlock.description') }}
        </p>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="unlock"
        >
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="errorMessage"
          />

          <UFormField :label="t('auth.unlock.password')">
            <UInput
              v-model="password"
              type="password"
              :placeholder="t('auth.unlock.passwordPlaceholder')"
              icon="i-lucide-key-round"
              :disabled="loading"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            :label="loading ? t('auth.unlock.verifying') : t('auth.unlock.submit')"
            :loading="loading"
            :disabled="!password"
            block
          />
        </form>

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
          class="self-center"
        />
      </div>
    </UCard>
  </div>
</template>
