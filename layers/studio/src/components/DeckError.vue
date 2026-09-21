<script setup lang="ts">
// Full-screen error placeholder for deck routes; self-contained for the bare
// `presentation` layout. `loginRedirect` turns it into a sign-in prompt (private
// deck reached anonymously): the CTA goes to /login and comes back here after.
defineProps<{
  title?: string
  message?: string
  loginRedirect?: string
  /** The signed-in login, on the not-found screen: names the account and offers to switch. */
  accountLogin?: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="deck-error">
    <div class="deck-error__icon">
      {{ loginRedirect ? '🔒' : '⚠️' }}
    </div>
    <h1 :class="{ 'deck-error__title--info': loginRedirect }">
      {{ title || t('auth.deckError.defaultTitle') }}
    </h1>
    <p>{{ message || t('auth.deckError.defaultMessage') }}</p>
    <NuxtLink
      v-if="loginRedirect"
      :to="`/login?redirect=${encodeURIComponent(loginRedirect)}`"
      class="deck-error__login"
    >
      {{ t('common.actions.signIn') }}
    </NuxtLink>
    <i18n-t
      v-if="accountLogin"
      keypath="auth.deckError.signedInAs"
      tag="p"
      class="deck-error__account"
      scope="global"
    >
      <template #login>
        <strong>{{ accountLogin }}</strong>
      </template>
      <template #switchAccount>
        <a href="/auth/logout">{{ t('auth.deckError.switchAccount') }}</a>
      </template>
    </i18n-t>
    <NuxtLink
      to="/"
      class="deck-error__back"
    >
      ← {{ t('common.actions.backToDecks') }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.deck-error {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  text-align: center;
  padding: 2rem;
  color: #e2e8f0;
  background: #0f172a;
  width: 100vw;
}

.deck-error__icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.deck-error h1 {
  color: #f87171;
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
}

/* A sign-in prompt is an expected state, not a failure: neutral title.
   Qualified with h1 to outrank the `.deck-error h1` rule above. */
.deck-error h1.deck-error__title--info {
  color: #e2e8f0;
}

.deck-error__login {
  margin-top: 2rem;
  padding: 0.6rem 1.4rem;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
}

.deck-error__login:hover {
  background: #1d4ed8;
}

.deck-error__account {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #94a3b8;
}

.deck-error__account a {
  color: #93c5fd;
}

.deck-error__back {
  margin-top: 2rem;
  color: #93c5fd;
  text-decoration: none;
  font-weight: 600;
}

.deck-error__back:hover {
  text-decoration: underline;
}
</style>
