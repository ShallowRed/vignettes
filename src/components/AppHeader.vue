<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ROLE_CONFIG } from '#shared/access'
import { useAppSession } from '~/composables/useAppSession'

// App chrome: brand left, identity (color mode, sign-in/out, role) right.
const { loggedIn, role, user, privileged } = useAppSession()
const roleDisplay = computed(() => ROLE_CONFIG[role.value])

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.login || user.value?.name || 'Compte', avatar: user.value?.avatar ? { src: user.value.avatar } : undefined }],
  // Management entries live here rather than as bare header icons: they are
  // occasional destinations, not primary navigation.
  ...(privileged.value
    ? [[
        ...(role.value === 'owner' ? [{ label: 'Comptes', icon: 'i-lucide-users', to: '/users' }] : []),
        { label: 'Corbeille', icon: 'i-lucide-trash-2', to: '/trash' },
      ]]
    : []),
  [{ label: 'Se déconnecter', icon: 'i-lucide-log-out', to: '/auth/logout', external: true }],
])
</script>

<template>
  <UHeader :toggle="false">
    <template #title>
      <div class="flex items-center gap-2.5">
        <div class="grid place-items-center size-8 rounded-lg bg-primary/10 text-primary">
          <UIcon
            name="i-lucide-presentation"
            class="size-5"
          />
        </div>
        <span class="text-highlighted font-bold">Vignettes</span>
      </div>
    </template>

    <template #right>
      <UColorModeButton />

      <!-- Route through /login so every configured provider is offered
           (a direct /auth/github link would hide Google from invited accounts). -->
      <UButton
        v-if="!loggedIn"
        to="/login"
        icon="i-lucide-log-in"
        label="Se connecter"
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
          <span class="text-xs text-muted">{{ roleDisplay.label }}</span>
        </UButton>
      </UDropdownMenu>
    </template>
  </UHeader>
</template>
