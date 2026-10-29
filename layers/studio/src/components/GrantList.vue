<script setup lang="ts">
import type { DeckGrant, GrantSummary } from '#shared/access'
import type { GrantRoleItem } from '../composables/useSharing'
import { isExpired } from '#shared/access'
import { shortDate } from '../utils/short-date'

/**
 * The grants of a scope, each with its role select and its remove button. On a
 * narrow panel the login keeps its full width and the mentions (never signed
 * in, expiry) move to the next line first. `locked` grants keep their role, and
 * a role disabled for a grant gives its reason under the row, which describes
 * the select. A `readonly` list names the role among the mentions, for grants
 * managed from another scope.
 */
const props = defineProps<{
  grants: GrantSummary[]
  roleItems?: (grant: GrantSummary) => GrantRoleItem[]
  busy?: boolean
  locked?: (grant: GrantSummary) => boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  changeRole: [grant: GrantSummary, role: DeckGrant]
  remove: [userId: number]
}>()

const { t, locale } = useI18n()
const id = useId()

const rows = computed(() => props.grants.map((grant) => {
  const items = props.roleItems?.(grant) ?? []
  return { grant, items, reason: items.find(item => item.disabled && item.reason)?.reason }
}))
</script>

<template>
  <ul class="flex flex-col gap-2">
    <li
      v-for="{ grant, items, reason } in rows"
      :key="grant.userId"
      class="flex flex-col gap-1 rounded-lg bg-elevated px-3 py-2"
    >
      <div class="flex items-center gap-2">
        <div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span class="text-sm font-medium break-all">{{ grant.login }}</span>
          <span
            v-if="readonly"
            class="text-xs text-muted"
          >{{ grant.role === 'editor' ? t('deck.sharing.roleEditor') : t('deck.sharing.roleViewer') }}</span>
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
          v-if="!readonly"
          :model-value="grant.role"
          :items="items"
          size="xs"
          class="w-24 shrink-0"
          :disabled="busy || isExpired(grant) || locked?.(grant)"
          :aria-label="t('deck.sharing.roleOf', { login: grant.login })"
          :aria-describedby="reason ? `${id}-${grant.userId}` : undefined"
          @update:model-value="(role: any) => emit('changeRole', grant, role)"
        />
        <UButton
          v-if="!readonly"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          :disabled="busy"
          :aria-label="t('deck.sharing.removeGrant')"
          @click="emit('remove', grant.userId)"
        />
      </div>
      <p
        v-if="reason"
        :id="`${id}-${grant.userId}`"
        class="text-xs text-dimmed"
      >
        {{ reason }}
      </p>
    </li>
  </ul>
</template>
