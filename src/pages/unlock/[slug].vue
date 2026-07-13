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
const hasAttempted = ref(false)

async function unlock() {
  loading.value = true
  errorMessage.value = ''
  hasAttempted.value = true

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
  <div
    class="min-h-screen bg-neutral flex items-center justify-center p-8"
    data-theme="corporate"
  >
    <div class="card bg-base-100 shadow-xl w-full max-w-md">
      <div class="card-body">
        <div class="grid place-items-center w-14 h-14 rounded-2xl bg-warning/15 text-warning mb-3">
          <Icon
            name="ri:lock-password-line"
            size="1.75rem"
          />
        </div>
        <h1 class="card-title text-xl mb-1">
          Présentation protégée
        </h1>
        <p class="text-base-content/60 mb-6">
          Cette présentation nécessite un mot de passe.
        </p>

        <form @submit.prevent="unlock">
          <div
            v-if="hasAttempted && errorMessage"
            role="alert"
            class="alert alert-error mb-4"
          >
            <Icon
              name="ri:error-warning-line"
              size="1.25rem"
            />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text">Mot de passe</span>
            </label>
            <input
              v-model="password"
              type="password"
              placeholder="Entrez le mot de passe"
              class="input input-bordered w-full"
              :disabled="loading"
              autofocus
            >
          </div>

          <div class="form-control mt-6">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="loading || !password"
            >
              <span
                v-if="loading"
                class="loading loading-spinner loading-sm"
              />
              {{ loading ? 'Vérification…' : 'Déverrouiller' }}
            </button>
          </div>
        </form>

        <div class="divider">
          ou
        </div>

        <NuxtLink
          to="/"
          class="btn btn-ghost btn-sm gap-1"
        >
          <Icon
            name="ri:arrow-left-line"
            size="1rem"
          />
          Retour aux présentations
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
