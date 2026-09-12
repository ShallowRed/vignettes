<script setup lang="ts">
definePageMeta({
  layout: false,
})

const route = useRoute()
const slug = computed(() => route.params.slug as string)

// Query params from the redirecting deck page (both optional, default to the
// slides route): `api` = endpoint to verify against (sets the access cookie),
// `return` = URL to send the user back to once unlocked.
const verifyApi = computed(() => {
  const api = route.query.api as string | undefined
  return api && api.startsWith('/api/') ? api : `/api/presentations/${slug.value}`
})
const returnTo = computed(() => {
  const r = route.query.return as string | undefined
  return r && r.startsWith('/') && !r.startsWith('//') ? r : `/slides/${slug.value}`
})

const password = ref('')
const errorMessage = ref('')
const loading = ref(false)

async function unlock() {
  loading.value = true
  errorMessage.value = ''

  try {
    const sep = verifyApi.value.includes('?') ? '&' : '?'
    await $fetch(`${verifyApi.value}${sep}password=${encodeURIComponent(password.value)}`)
    // `replace: true`: drop /unlock from history so Back skips it (the cookie is
    // now set, so returning here would just re-redirect to the deck).
    await navigateTo(returnTo.value, { replace: true })
  }
  catch (e: any) {
    if (e.statusCode === 403)
      errorMessage.value = 'Mot de passe incorrect'
    else if (e.statusCode === 401)
      errorMessage.value = 'Mot de passe requis'
    else
      errorMessage.value = e.message || 'Une erreur est survenue'
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
          Présentation protégée
        </h1>
        <p class="text-muted mb-4">
          Cette présentation nécessite un mot de passe.
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

          <UFormField label="Mot de passe">
            <UInput
              v-model="password"
              type="password"
              placeholder="Entrez le mot de passe"
              icon="i-lucide-key-round"
              :disabled="loading"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            :label="loading ? 'Vérification…' : 'Déverrouiller'"
            :loading="loading"
            :disabled="!password"
            block
          />
        </form>

        <USeparator
          label="ou"
          class="my-3"
        />

        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          label="Retour aux présentations"
          color="neutral"
          variant="ghost"
          size="sm"
          class="self-center"
        />
      </div>
    </UCard>
  </div>
</template>
