<script setup lang="ts">
definePageMeta({
  layout: false,
})

const route = useRoute()
const error = computed(() => route.query.error as string | undefined)

// Carry the intended destination across the OAuth round-trip: stash it in a
// short-lived cookie the GitHub onSuccess handler reads to redirect back.
const redirectCookie = useCookie('auth_redirect', { maxAge: 600, sameSite: 'lax' })
const redirect = computed(() => route.query.redirect as string | undefined)
onMounted(() => {
  if (redirect.value && redirect.value.startsWith('/'))
    redirectCookie.value = redirect.value
})

const errorMessage = computed(() => {
  switch (error.value) {
    case 'oauth_failed':
      return 'L\'authentification GitHub a échoué. Veuillez réessayer.'
    default:
      return error.value ? 'Authentification impossible. Veuillez réessayer.' : ''
  }
})
</script>

<template>
  <div class="tailwind-app min-h-dvh bg-elevated flex items-center justify-center p-8">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center text-center gap-2">
        <div class="grid place-items-center size-14 rounded-2xl bg-primary/10 text-primary mb-1">
          <UIcon
            name="i-lucide-presentation"
            class="size-7"
          />
        </div>
        <h1 class="text-2xl font-bold text-highlighted">
          Nuxt Slides
        </h1>
        <p class="text-muted mb-4">
          Connectez-vous pour gérer vos présentations
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="errorMessage"
          class="mb-2 text-left"
        />

        <UButton
          to="/auth/github"
          external
          icon="i-lucide-github"
          label="Se connecter avec GitHub"
          color="neutral"
          size="lg"
          block
        />

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
        />
      </div>
    </UCard>
  </div>
</template>
