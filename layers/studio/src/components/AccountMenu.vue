<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ROLE_CONFIG } from '#shared/access'
import { useAppSession } from '../composables/useAppSession'
import { useInstanceLinks } from '../composables/useInstanceLinks'
import { postForm } from '../utils/post-form'

// The occasional destinations and the preferences of the reader: the links of
// the instance, the language, the color mode, then the account pages. One menu
// holds them, opened by the account once signed in and by a menu button for a
// visitor, who signs in beside it.
const { loggedIn, role, user, privileged, owner } = useAppSession()
const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()
const links = useInstanceLinks()

const COLOR_MODES = [
  { value: 'light', icon: 'i-lucide-sun' },
  { value: 'dark', icon: 'i-lucide-moon' },
  { value: 'system', icon: 'i-lucide-monitor' },
] as const

const preferences = computed<DropdownMenuItem[]>(() => [
  {
    label: t('common.header.language'),
    icon: 'i-lucide-languages',
    children: locales.value.map(item => ({
      label: item.name,
      type: 'checkbox' as const,
      checked: item.code === locale.value,
      onSelect: () => setLocale(item.code),
    })),
  },
  {
    label: t('common.header.colorMode'),
    icon: colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun',
    children: COLOR_MODES.map(mode => ({
      label: t(`common.header.colorModes.${mode.value}`),
      icon: mode.icon,
      type: 'checkbox' as const,
      checked: colorMode.preference === mode.value,
      onSelect: () => { colorMode.preference = mode.value },
    })),
  },
])

// The links open in a new tab; their arrow takes the place of a submenu's chevron.
const linkItems = computed<DropdownMenuItem[]>(() => links.value.map(link => ({ label: link.label, icon: link.icon, to: link.url, target: '_blank', slot: 'external' as const })))

const items = computed<DropdownMenuItem[][]>(() => [
  ...(loggedIn.value
    ? [[{ type: 'label' as const, label: user.value?.login || user.value?.name || t('common.header.account'), description: t(ROLE_CONFIG[role.value].labelKey), avatar: user.value?.avatar ? { src: user.value.avatar } : undefined }]]
    : []),
  ...(linkItems.value.length ? [linkItems.value] : []),
  preferences.value,
  ...(loggedIn.value
    ? [
        [
          { label: t('common.header.tokens'), icon: 'i-lucide-key-round', to: '/tokens' },
          ...(owner.value ? [{ label: t('common.header.accounts'), icon: 'i-lucide-users', to: '/users' }] : []),
          ...(privileged.value ? [{ label: t('common.header.trash'), icon: 'i-lucide-trash-2', to: '/trash' }] : []),
        ],
        [{ label: t('common.actions.signOut'), icon: 'i-lucide-log-out', onSelect: () => postForm('/auth/logout') }],
      ]
    : []),
])
</script>

<template>
  <div class="flex items-center gap-1.5 shrink-0">
    <!-- Route through /login so every configured provider is offered
         (a direct /auth/github link would hide Google from invited accounts). -->
    <UButton
      v-if="!loggedIn"
      to="/login"
      icon="i-lucide-log-in"
      :label="t('common.actions.signIn')"
      :ui="{ label: 'max-md:sr-only' }"
      color="neutral"
      variant="ghost"
    />
    <UDropdownMenu
      :items="items"
      :external-icon="false"
      :content="{ align: 'end' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        :aria-label="loggedIn ? (user?.login || t('common.header.account')) : t('common.header.menu')"
        :icon="loggedIn ? (user?.avatar ? undefined : 'i-lucide-circle-user-round') : 'i-lucide-menu'"
        class="max-md:px-1.5"
      >
        <UAvatar
          v-if="loggedIn && user?.avatar"
          :src="user.avatar"
          :alt="user.login || ''"
          size="xs"
        />
        <span
          v-if="loggedIn"
          class="max-md:sr-only"
        >{{ user?.login || user?.name }}</span>
      </UButton>
      <template #external-trailing>
        <UIcon
          name="i-lucide-arrow-up-right"
          class="size-4 shrink-0 text-dimmed"
        />
      </template>
    </UDropdownMenu>
  </div>
</template>
