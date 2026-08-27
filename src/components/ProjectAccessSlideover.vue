<script setup lang="ts">
import { useSharing } from '~/composables/useSharing'

/**
 * Project access panel (owner only). A project grant is a master key: it opens
 * every deck in the project, private ones included. Mirrors the per-deck sharing
 * UX in DeckMetaSlideover, scoped to a project — both share `useSharing`.
 */
const props = defineProps<{
  project: { slug: string, title: string }
}>()

const open = defineModel<boolean>('open', { required: true })

// Grants + users load only while the slideover is open (enabled gate). The
// whole bag also feeds ShareGrantForm (add + invite-by-email).
const sharing = useSharing(() => ({ kind: 'project', slug: props.project.slug }), () => open.value)
const { grants, grantRoleItems, changeGrantRole, removeGrant, busy } = sharing
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="`Accès · ${project.title}`"
    description="Ouvre tout le dossier à un compte précis."
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-xs text-muted flex items-center gap-1.5">
          <UIcon
            name="i-lucide-key-round"
            class="size-3.5 shrink-0"
          />
          Un accès accordé ici ouvre toutes les présentations du dossier, privées comprises.
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
              :aria-label="`Rôle de ${grant.login}`"
              @update:model-value="(r: any) => changeGrantRole(grant, r)"
            />
            <span
              v-if="grant.invited"
              class="text-xs text-dimmed"
            >· jamais connecté</span>
            <span
              v-if="grant.expiresAt"
              class="text-xs"
              :class="new Date(grant.expiresAt) < new Date() ? 'text-error' : 'text-dimmed'"
            >· {{ new Date(grant.expiresAt) < new Date() ? 'expiré' : `expire le ${new Date(grant.expiresAt).toLocaleDateString('fr-FR')}` }}</span>
            <div class="flex-1" />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="busy"
              aria-label="Retirer l'accès"
              @click="removeGrant(grant.userId)"
            />
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-dimmed"
        >
          Aucun accès au dossier.
        </p>

        <ShareGrantForm :sharing="sharing" />
      </div>
    </template>
  </USlideover>
</template>
