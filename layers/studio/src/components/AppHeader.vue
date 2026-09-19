<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ROLE_CONFIG } from '#shared/access'
import { useAppSession } from '../composables/useAppSession'

// App chrome: brand left, identity (color mode, sign-in/out, role) right.
const { loggedIn, role, user, privileged } = useAppSession()
const { t, locale, locales, setLocale } = useI18n()
const localeItems = computed<DropdownMenuItem[]>(() => locales.value.map(item => ({
  label: item.name,
  type: 'checkbox' as const,
  checked: item.code === locale.value,
  onSelect: () => setLocale(item.code),
})))
const roleDisplay = computed(() => ROLE_CONFIG[role.value])

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.login || user.value?.name || t('common.header.account'), avatar: user.value?.avatar ? { src: user.value.avatar } : undefined }],
  // Management entries live here rather than as bare header icons: they are
  // occasional destinations, not primary navigation.
  ...(privileged.value
    ? [[
        ...(role.value === 'owner' ? [{ label: t('common.header.accounts'), icon: 'i-lucide-users', to: '/users' }] : []),
        { label: t('common.header.trash'), icon: 'i-lucide-trash-2', to: '/trash' },
      ]]
    : []),
  [{ label: t('common.actions.signOut'), icon: 'i-lucide-log-out', to: '/auth/logout', external: true }],
])
</script>

<template>
  <UHeader :toggle="false">
    <template #title>
      <div class="flex items-center gap-2.5">
        <div class="grid place-items-center size-8 rounded-lg bg-primary/10 text-primary">
          <VignettesMark class="w-5" />
        </div>
        <span class="text-highlighted font-bold">Vignettes</span>
      </div>
    </template>

    <template #right>
      <UDropdownMenu
        :items="localeItems"
        :content="{ align: 'end' }"
      >
        <UButton
          icon="i-lucide-languages"
          color="neutral"
          variant="ghost"
          :aria-label="t('common.header.language')"
        />
      </UDropdownMenu>

      <UColorModeButton />

      <!-- Route through /login so every configured provider is offered
           (a direct /auth/github link would hide Google from invited accounts). -->
      <UButton
        v-if="!loggedIn"
        to="/login"
        icon="i-lucide-log-in"
        :label="t('common.actions.signIn')"
        color="neutral"
        variant="subtle"
      />

      <UDropdownMenu
        v-else
        :items="menuItems"
        :content="{ align: 'end' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-chevron-down"
        >
          <UAvatar
            v-if="user?.avatar"
            :src="user.avatar"
            :alt="user?.login || 'avatar'"
            size="2xs"
          />
          <span class="hidden sm:inline">{{ user?.login || user?.name }}</span>
          <span class="text-xs text-muted">{{ t(roleDisplay.labelKey) }}</span>
        </UButton>
      </UDropdownMenu>
    </template>
  </UHeader>
</template>
