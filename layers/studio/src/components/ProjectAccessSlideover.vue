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

const { t } = useI18n()

// Grants + users load only while the slideover is open (enabled gate). The
// whole bag also feeds ShareGrantForm (add + invite-by-email).
const sharing = useSharing(() => ({ kind: 'project', slug: props.project.slug }), () => open.value, () => true)
const { grants, grantRoleItemsOf, changeGrantRole, removeGrant, busy } = sharing
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

        <GrantList
          v-if="grants.length > 0"
          :grants="grants"
          :role-items="grantRoleItemsOf"
          :busy="busy"
          @change-role="changeGrantRole"
          @remove="removeGrant"
        />
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
