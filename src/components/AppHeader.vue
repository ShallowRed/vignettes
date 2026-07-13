<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ROLE_CONFIG } from '#shared/access'
import { useAppSession } from '~/composables/useAppSession'

// App chrome: brand left, identity (color mode, sign-in/out, role) right.
const { loggedIn, role, user } = useAppSession()
const roleDisplay = computed(() => ROLE_CONFIG[role.value])

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.login || user.value?.name || 'Compte', avatar: user.value?.avatar ? { src: user.value.avatar } : undefined }],
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
        <span class="text-highlighted font-bold">Nuxt Slides</span>
      </div>
    </template>

    <template #right>
      <UColorModeButton />

      <UButton
        v-if="!loggedIn"
        to="/auth/github"
        external
        icon="i-lucide-github"
        label="Sign in"
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
          <UBadge
            :color="roleDisplay.color"
            variant="subtle"
            size="sm"
            :icon="roleDisplay.icon"
            :label="roleDisplay.label"
          />
        </UButton>
      </UDropdownMenu>
    </template>
  </UHeader>
</template>
