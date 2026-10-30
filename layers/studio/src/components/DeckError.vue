<script setup lang="ts">
import { loginHref } from '#shared/access'
import { postForm } from '../utils/post-form'

// The error screen of the deck routes. `loginRedirect` turns it into a sign-in
// prompt (private deck reached anonymously): the button goes to /login and
// comes back here after.
const props = defineProps<{
  icon: string
  title?: string
  message?: string
  loginRedirect?: string
  /** The signed-in login, on the not-found screen: names the account and offers to switch. */
  accountLogin?: string
}>()

const { t } = useI18n()

const actions = computed(() => props.loginRedirect
  ? [{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: loginHref(props.loginRedirect) }]
  : [])
</script>

<template>
  <ErrorState
    :icon="icon"
    :title="title || t('auth.deckError.defaultTitle')"
    :description="message || t('auth.deckError.defaultMessage')"
    :actions="actions"
    :back="{ to: '/' }"
  >
    <i18n-t
      v-if="accountLogin"
      keypath="auth.deckError.signedInAs"
      tag="p"
      class="text-sm text-muted"
      scope="global"
    >
      <template #login>
        <strong class="text-default">{{ accountLogin }}</strong>
      </template>
      <template #switchAccount>
        <ULink
          class="underline"
          @click="postForm('/auth/logout')"
        >
          {{ t('auth.deckError.switchAccount') }}
        </ULink>
      </template>
    </i18n-t>
  </ErrorState>
</template>
