<script setup lang="ts">
import type { DeckGrant, PublicationStatus } from '#shared/access'
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { PUBLICATION_STATUSES } from '#shared/access'
import { STATUS_CONFIG } from '#shared/presentations'
import { KNOWN_THEMES } from '#shared/theme'
import { useAppSession } from '~/composables/useAppSession'

/**
 * Deck management panel: catalog/access metadata through the admin PATCH, plus
 * per-deck sharing grants (owner only). Reused by the catalog and the editor.
 */
const props = defineProps<{
  item: PresentationListItem
  projects?: Project[]
}>()

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')
const toast = useToast()

// A non-empty sentinel marks "none" in the selects (reka-ui forbids an
// empty-string SelectItem value); mapped back to null (clear column) at PATCH time.
const NONE = '__none__'

const state = reactive({
  title: '',
  status: 'private' as PublicationStatus,
  unlisted: false,
  project: NONE,
  theme: NONE,
  alias: '',
})

// immediate: the panel is often mounted with `open` already true (v-if + open
// set in the same tick), so a plain transition watcher would never seed the form.
watch(open, (now) => {
  if (now) {
    Object.assign(state, {
      title: props.item.title,
      status: props.item.status,
      unlisted: props.item.unlisted ?? false,
      project: props.item.project ?? NONE,
      theme: props.item.theme ?? NONE,
      alias: props.item.alias ?? '',
    })
    if (isOwner.value)
      loadSharing()
  }
}, { immediate: true })

const statusItems = PUBLICATION_STATUSES.map(status => ({
  label: STATUS_CONFIG[status].label,
  value: status,
}))

const projectItems = computed(() => [
  { label: 'Sans projet', value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

const themeItems = KNOWN_THEMES.map(name => ({ label: name, value: name }))

const saving = ref(false)

function close() {
  open.value = false
}

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/admin/decks/${props.item.slug}`, {
      method: 'PATCH',
      body: {
        title: state.title.trim() || props.item.title,
        status: state.status,
        unlisted: state.unlisted,
        project: state.project === NONE ? null : state.project,
        theme: state.theme === NONE ? null : state.theme,
        alias: state.alias.trim() || null,
      },
    })
    toast.add({ title: 'Métadonnées enregistrées', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    emit('saved')
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec de l\'enregistrement', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ── Sharing (per-deck grants, owner only) ───────────────────────────────────

interface GrantRow { userId: number, login: string, role: DeckGrant }
interface UserRow { id: number, login: string, role: string }

const grants = ref<GrantRow[]>([])
const knownUsers = ref<UserRow[]>([])
const grantUserId = ref<number | undefined>(undefined)
const grantRole = ref<DeckGrant>('viewer')
const sharingBusy = ref(false)

async function loadSharing() {
  try {
    const [g, u] = await Promise.all([
      $fetch<GrantRow[]>(`/api/admin/decks/${props.item.slug}/permissions`),
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

// Global owners/editors already edit everything; only offer users a grant can escalate.
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
  sharingBusy.value = true
  try {
    await $fetch(`/api/admin/decks/${props.item.slug}/permissions/${grantUserId.value}`, {
      method: 'PUT',
      body: { role: grantRole.value },
    })
    grantUserId.value = undefined
    await loadSharing()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec du partage', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    sharingBusy.value = false
  }
}

async function removeGrant(userId: number) {
  sharingBusy.value = true
  try {
    await $fetch(`/api/admin/decks/${props.item.slug}/permissions/${userId}`, { method: 'DELETE' })
    await loadSharing()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec du retrait', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    sharingBusy.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="item.title"
    :description="`Métadonnées de ${item.slug}`"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <UFormField
          label="Titre"
          required
        >
          <UInput
            v-model="state.title"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Accès"
          description="Qui peut ouvrir le contenu."
        >
          <USelect
            v-model="state.status"
            :items="statusItems"
            class="w-full"
          />
        </UFormField>

        <div class="rounded-lg bg-muted p-3 flex flex-col gap-3">
          <p class="text-xs font-medium text-muted uppercase tracking-wide">
            Catalogue
          </p>
          <UFormField
            label="Non répertoriée"
            description="Accessible par lien mais absente du catalogue."
          >
            <USwitch v-model="state.unlisted" />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Projet">
            <USelect
              v-model="state.project"
              :items="projectItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Thème">
            <USelect
              v-model="state.theme"
              :items="[{ label: 'Par défaut (dsfr)', value: NONE }, ...themeItems]"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          label="Alias"
          help="Adresse stable /p/<alias> ; vide = pas d'alias."
        >
          <UInput
            v-model="state.alias"
            placeholder="mon-alias"
            class="w-full font-mono"
          />
        </UFormField>

        <template v-if="isOwner">
          <USeparator label="Partage" />

          <p class="text-sm text-muted -mt-1">
            Ouvre ce deck à un compte précis au-delà de son statut.
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
              <span class="text-xs text-muted">{{ grant.role === 'editor' ? 'Édition' : 'Lecture' }}</span>
              <div class="flex-1" />
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="sharingBusy"
                aria-label="Retirer l'accès"
                @click="removeGrant(grant.userId)"
              />
            </li>
          </ul>
          <p
            v-else
            class="text-sm text-dimmed"
          >
            Aucun accès individuel.
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
              :disabled="grantUserId == null || sharingBusy"
              aria-label="Accorder l'accès"
              @click="addGrant"
            />
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Annuler"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          label="Enregistrer"
          icon="i-lucide-check"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </USlideover>
</template>
