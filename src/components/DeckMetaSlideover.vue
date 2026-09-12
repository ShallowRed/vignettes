<script setup lang="ts">
import type { GrantSummary, PublicationStatus } from '#shared/access'
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { PUBLICATION_STATUSES } from '#shared/access'
import { STATUS_CONFIG } from '#shared/presentations'
import { useMutation, useQuery } from '@pinia/colada'
import { knownThemes } from '@vignettes/core/theme'
import { deckApi } from '~/api'
import { useAppSession } from '~/composables/useAppSession'
import { useCatalogCache } from '~/composables/useCatalog'
import { useSharing } from '~/composables/useSharing'
import { grantsQuery } from '~/queries'

/**
 * Deck management panel: catalog/access metadata through the admin PATCH, plus
 * per-deck sharing grants (owner only). Reused by the catalog and the editor.
 */
const props = defineProps<{
  item: PresentationListItem
  projects?: Project[]
  /** Section to bring into view when the panel opens. */
  focus?: 'sharing'
}>()

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')
const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

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
  // Plain text, hashed server-side; empty = keep the stored hash untouched.
  password: '',
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
      password: '',
    })
  }
}, { immediate: true })

// The server fail-closes a semi-private deck with no hash: block the save that
// would brick it rather than warn after the fact.
const passwordReady = computed(() => state.password.trim().length >= 8)
const passwordMissing = computed(() =>
  state.status === 'semi-private' && !props.item.hasPassword && !passwordReady.value)

const statusItems = PUBLICATION_STATUSES.map(status => ({
  label: STATUS_CONFIG[status].label,
  value: status,
}))

const projectItems = computed(() => [
  { label: 'Sans projet', value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

const themeItems = knownThemes().map(name => ({ label: name, value: name }))

function close() {
  open.value = false
}

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () => deckApi.updateMeta($fetch, props.item.slug, {
    title: state.title.trim() || props.item.title,
    status: state.status,
    unlisted: state.unlisted,
    project: state.project === NONE ? null : state.project,
    theme: state.theme === NONE ? null : state.theme,
    alias: state.alias.trim() || null,
    ...(passwordReady.value ? { accessPassword: state.password.trim() } : {}),
  }),
  async onSuccess() {
    toast.add({ title: 'Métadonnées enregistrées', icon: 'i-lucide-check', color: 'success' })
    await invalidatePresentations()
    open.value = false
    emit('saved')
  },
  onError(e: any) {
    toast.add({ title: e?.statusMessage || 'Échec de l\'enregistrement', icon: 'i-lucide-triangle-alert', color: 'error' })
  },
})

// ── Sharing (per-deck grants, owner only) ───────────────────────────────────
// Delegated to the shared `useSharing`; grants + users load only while the panel
// is open for an owner (enabled gate). The whole bag also feeds ShareGrantForm.
// Opened from a "Partager…" entry: bring that section into view instead of
// leaving the reader at the top of a long panel.
const sharingSection = useTemplateRef<HTMLElement>('sharingSection')
watch(() => open.value && props.focus === 'sharing', (focus) => {
  if (!focus)
    return
  // The panel mounts with `open` already true, so the first evaluation counts.
  // Focusing the section (rather than scrolling it) survives the slideover's own
  // focus handling, which otherwise pulls the body back to the top, and it puts
  // keyboard users at the same place.
  setTimeout(() => sharingSection.value?.focus(), 300)
}, { immediate: true, flush: 'post' })

const sharing = useSharing(() => ({ kind: 'deck', slug: props.item.slug }), () => open.value && isOwner.value)
const { grants, grantRoleItems, changeGrantRole, removeGrant, busy: sharingBusy } = sharing

// The folder's master keys open this deck too: surface them here (read-only,
// same cache key as the folder panel) so this panel cannot claim "no access"
// while the whole folder is shared.
const requestFetch = useRequestFetch()
const projectGrantsQ = useQuery({
  ...grantsQuery(requestFetch, () => ({ kind: 'project', slug: props.item.project! })),
  enabled: () => open.value && isOwner.value && !!props.item.project,
})
const projectGrants = computed<GrantSummary[]>(() =>
  props.item.project ? (projectGrantsQ.data.value ?? []) : [])

// One sentence answering "who can open this deck?", folding status, password
// and both grant scopes — the recomposition the three separate panels lack.
const audience = computed(() => {
  const base = state.status === 'public'
    ? 'Tout le monde'
    : state.status === 'semi-private'
      ? (props.item.hasPassword || passwordReady.value
          ? 'Toute personne ayant le mot de passe'
          : 'Personne (aucun mot de passe défini)')
      : 'Les comptes Éditeur/Owner'
  const extras: string[] = []
  if (grants.value.length)
    extras.push(`${grants.value.length} accès direct${grants.value.length > 1 ? 's' : ''}`)
  if (projectGrants.value.length)
    extras.push(`${projectGrants.value.length} via le dossier`)
  return extras.length ? `${base}, plus ${extras.join(' et ')}.` : `${base}.`
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="item.title"
    :description="`Métadonnées de ${item.slug}`"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-eye"
          title="Qui peut ouvrir cette présentation"
          :description="audience"
        />

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

        <div
          v-if="state.status === 'semi-private'"
          class="rounded-lg bg-muted p-3 flex flex-col gap-2"
        >
          <p class="text-xs font-medium text-muted uppercase tracking-wide">
            Mot de passe
          </p>
          <p class="text-xs text-muted">
            {{ item.hasPassword
              ? 'Un mot de passe est défini. Saisissez-en un nouveau pour le remplacer.'
              : 'Aucun mot de passe défini pour le moment.' }}
          </p>
          <UInput
            v-model="state.password"
            type="password"
            placeholder="Minimum 8 caractères"
            class="w-full"
          />
          <UAlert
            v-if="passwordMissing"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Sans mot de passe, la présentation serait inaccessible à tous."
          />
        </div>

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
          <div
            ref="sharingSection"
            tabindex="-1"
            class="outline-none"
          >
            <USeparator label="Partage" />
          </div>

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
              <USelect
                :model-value="grant.role"
                :items="grantRoleItems"
                size="xs"
                class="w-24"
                :disabled="sharingBusy || (grant.expiresAt != null && new Date(grant.expiresAt) < new Date())"
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

          <div
            v-if="projectGrants.length"
            class="rounded-lg bg-muted p-3 flex flex-col gap-2"
          >
            <p class="text-xs font-medium text-muted uppercase tracking-wide">
              Via le dossier (clé maîtresse)
            </p>
            <ul class="flex flex-col gap-1">
              <li
                v-for="grant in projectGrants"
                :key="grant.userId"
                class="flex items-center gap-2 text-sm"
              >
                <span>{{ grant.login }}</span>
                <span class="text-xs text-muted">{{ grant.role === 'editor' ? 'Édition' : 'Lecture' }}</span>
                <span
                  v-if="grant.invited"
                  class="text-xs text-dimmed"
                >· jamais connecté</span>
              </li>
            </ul>
            <p class="text-xs text-dimmed">
              Se gère depuis « Gérer l'accès » du dossier.
            </p>
          </div>

          <ShareGrantForm :sharing="sharing" />
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
          :disabled="passwordMissing"
          @click="() => save()"
        />
      </div>
    </template>
  </USlideover>
</template>
