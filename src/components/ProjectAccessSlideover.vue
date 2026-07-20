<script setup lang="ts">
import type { DeckGrant } from '#shared/access'

/**
 * Project access panel (owner only). A project grant is a master key: it opens
 * every deck in the project, private ones included. Mirrors the per-deck sharing
 * UX in DeckMetaSlideover, scoped to a project.
 */
const props = defineProps<{
  project: { slug: string, title: string }
}>()

const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

interface GrantRow { userId: number, login: string, role: DeckGrant }
interface UserRow { id: number, login: string, role: string }

const grants = ref<GrantRow[]>([])
const knownUsers = ref<UserRow[]>([])
const grantUserId = ref<number | undefined>(undefined)
const grantRole = ref<DeckGrant>('viewer')
const busy = ref(false)

async function load() {
  try {
    const [g, u] = await Promise.all([
      $fetch<GrantRow[]>(`/api/admin/projects/${props.project.slug}/permissions`),
      $fetch<UserRow[]>('/api/admin/users'),
    ])
    grants.value = g
    knownUsers.value = u
  }
  catch {
    grants.value = []
    knownUsers.value = []
  }
}

watch(open, (isOpen) => {
  if (isOpen)
    load()
}, { immediate: true })

// Global owners/editors already see everything; only a viewer can be escalated.
const grantableUsers = computed(() => {
  const granted = new Set(grants.value.map(g => g.userId))
  return knownUsers.value
    .filter(u => u.role === 'viewer' && !granted.has(u.id))
    .map(u => ({ label: u.login, value: u.id }))
})

const grantRoleItems = [
  { label: 'Lecture', value: 'viewer' },
  { label: 'Édition', value: 'editor' },
]

async function addGrant() {
  if (grantUserId.value == null)
    return
  busy.value = true
  try {
    await $fetch(`/api/admin/projects/${props.project.slug}/permissions/${grantUserId.value}`, {
      method: 'PUT',
      body: { role: grantRole.value },
    })
    grantUserId.value = undefined
    await load()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec du partage', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function removeGrant(userId: number) {
  busy.value = true
  try {
    await $fetch(`/api/admin/projects/${props.project.slug}/permissions/${userId}`, { method: 'DELETE' })
    await load()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec du retrait', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    busy.value = false
  }
}
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

        <div class="flex items-end gap-2">
          <UFormField
            label="Ajouter un accès"
            class="flex-1"
          >
            <USelect
              v-model="grantUserId"
              :items="grantableUsers"
              placeholder="Choisir un compte"
              class="w-full"
            />
          </UFormField>
          <USelect
            v-model="grantRole"
            :items="grantRoleItems"
            class="w-28"
          />
          <UButton
            icon="i-lucide-user-plus"
            :disabled="grantUserId == null || busy"
            aria-label="Accorder l'accès"
            @click="addGrant"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
