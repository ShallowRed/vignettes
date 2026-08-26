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
const { grants, removeGrant, busy } = sharing
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="`Accès — ${project.title}`"
    description="Ouvre tout le dossier à un compte précis."
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-key-round"
          title="Clé maîtresse du dossier"
          description="Un accès accordé ici ouvre toutes les présentations du dossier, y compris les privées."
        />

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
            <span class="text-xs text-muted">{{ grant.role === 'editor' ? 'Édition' : 'Lecture' }}</span>
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
