<script setup lang="ts">
import type { DeckGrant, GrantSummary } from '#shared/access'
import type { SelectItem } from '@nuxt/ui'
import { isExpired } from '#shared/access'
import { shortDate } from '../utils/short-date'

/**
 * The grants of a scope, each with its role select and its remove button. On a
 * narrow panel the login keeps its full width and the mentions (never signed
 * in, expiry) move to the next line first. `locked` grants keep their role.
 */
const props = defineProps<{
  grants: GrantSummary[]
  roleItems: SelectItem[]
  busy: boolean
  locked?: (grant: GrantSummary) => boolean
}>()

const emit = defineEmits<{
  changeRole: [grant: GrantSummary, role: DeckGrant]
  remove: [userId: number]
}>()

const { t, locale } = useI18n()
</script>

<template>
  <ul class="flex flex-col gap-2">
    <li
      v-for="grant in props.grants"
      :key="grant.userId"
      class="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2"
    >
      <div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span class="text-sm font-medium break-all">{{ grant.login }}</span>
        <span
          v-if="grant.invited"
          class="text-xs text-dimmed"
        >{{ t('deck.sharing.neverSignedIn') }}</span>
        <span
          v-if="grant.expiresAt"
          class="text-xs"
          :class="isExpired(grant) ? 'text-error' : 'text-dimmed'"
        >{{ isExpired(grant) ? t('deck.sharing.expired') : t('deck.sharing.expiresOn', { date: shortDate(grant.expiresAt, locale) }) }}</span>
      </div>
      <USelect
        :model-value="grant.role"
        :items="roleItems"
        size="xs"
        class="w-24 shrink-0"
        :disabled="busy || isExpired(grant) || locked?.(grant)"
        :aria-label="t('deck.sharing.roleOf', { login: grant.login })"
        @update:model-value="(role: any) => emit('changeRole', grant, role)"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        class="shrink-0"
        :disabled="busy"
        :aria-label="t('deck.sharing.removeGrant')"
        @click="emit('remove', grant.userId)"
      />
    </li>
  </ul>
</template>
