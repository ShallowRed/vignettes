<script setup lang="ts">
import { useSharing } from '../composables/useSharing'

/**
 * Project access panel (owner only). A project grant is a master key: it opens
 * every deck in the project, private ones included. Mirrors the per-deck sharing
 * UX in DeckMetaSlideover, scoped to a project — both share `useSharing`.
 */
const props = defineProps<{
  project: { slug: string, title: string }
}>()

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()

// Grants + users load only while the slideover is open (enabled gate). The
// whole bag also feeds ShareGrantForm (add + invite-by-email).
const sharing = useSharing(() => ({ kind: 'project', slug: props.project.slug }), () => open.value)
const { grants, grantRoleItems, changeGrantRole, removeGrant, busy } = sharing
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('deck.projectAccess.title', { project: project.title })"
    :description="t('deck.projectAccess.description')"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-xs text-muted flex items-center gap-1.5">
          <UIcon
            name="i-lucide-key-round"
            class="size-3.5 shrink-0"
          />
          {{ t('deck.projectAccess.masterKeyHint') }}
        </p>

        <ul
          v-if="grants.length > 0"
          class="flex flex-col gap-2"
        >
          <li
            v-for="grant in grants"
            :key="grant.userId"
            class="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2"
          >
            <span class="text-sm font-medium">{{ grant.login }}</span>
            <USelect
              :model-value="grant.role"
              :items="grantRoleItems"
              size="xs"
              class="w-24"
              :disabled="busy || (grant.expiresAt != null && new Date(grant.expiresAt) < new Date())"
              :aria-label="t('deck.sharing.roleOf', { login: grant.login })"
              @update:model-value="(r: any) => changeGrantRole(grant, r)"
            />
            <span
              v-if="grant.invited"
              class="text-xs text-dimmed"
            >· {{ t('deck.sharing.neverSignedIn') }}</span>
            <span
              v-if="grant.expiresAt"
              class="text-xs"
              :class="new Date(grant.expiresAt) < new Date() ? 'text-error' : 'text-dimmed'"
            >· {{ new Date(grant.expiresAt) < new Date() ? t('deck.sharing.expired') : t('deck.sharing.expiresOn', { date: new Date(grant.expiresAt).toLocaleDateString(locale) }) }}</span>
            <div class="flex-1" />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="busy"
              :aria-label="t('deck.sharing.removeGrant')"
              @click="removeGrant(grant.userId)"
            />
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-dimmed"
        >
          {{ t('deck.projectAccess.noGrants') }}
        </p>

        <ShareGrantForm :sharing="sharing" />
      </div>
    </template>
  </USlideover>
</template>
