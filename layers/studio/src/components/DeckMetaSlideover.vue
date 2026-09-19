<script setup lang="ts">
import type { GrantSummary, PublicationStatus } from '#shared/access'
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { PUBLICATION_STATUSES } from '#shared/access'
import { STATUS_CONFIG } from '#shared/presentations'
import { useMutation, useQuery } from '@pinia/colada'
import { knownThemes } from '@vignettes/core/theme'
import { deckApi } from '../api'
import { useAppSession } from '../composables/useAppSession'
import { useCatalog, useCatalogCache } from '../composables/useCatalog'
import { useSharing } from '../composables/useSharing'
import { grantsQuery } from '../queries'

/**
 * Deck settings panel, in three tabs: the deck itself (title, folder, theme,
 * address), who can open it (visibility, catalog, sharing grants for the owner)
 * and its variants. Metadata saves through the admin PATCH; grants apply as soon
 * as they are added. Reused by the catalog and the editor.
 */
const props = defineProps<{
  item: PresentationListItem
  projects?: Project[]
  /** Section to bring into view when the panel opens. */
  focus?: 'sharing'
}>()

const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()

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
  family: '',
  variantLabel: '',
  supersededBy: NONE,
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
      family: props.item.family ?? '',
      variantLabel: props.item.variantLabel ?? '',
      supersededBy: props.item.supersededBy ?? NONE,
      password: '',
    })
  }
}, { immediate: true })

// The server fail-closes a semi-private deck with no hash: block the save that
// would brick it rather than warn after the fact.
const passwordReady = computed(() => state.password.trim().length >= 8)
const passwordMissing = computed(() =>
  state.status === 'semi-private' && !props.item.hasPassword && !passwordReady.value)

const STATUS_DESCRIPTIONS: Record<PublicationStatus, string> = {
  'public': 'Tout le monde peut l\'ouvrir.',
  'semi-private': 'Toute personne ayant le mot de passe.',
  'private': 'Les comptes Éditeur et Owner, et les accès individuels.',
}
const statusItems = PUBLICATION_STATUSES.map(status => ({
  label: t(STATUS_CONFIG[status].labelKey),
  description: STATUS_DESCRIPTIONS[status],
  value: status,
}))

type Tab = 'general' | 'access' | 'variants'
const tab = ref<Tab>('general')
watch(open, (now) => {
  if (now)
    tab.value = props.focus === 'sharing' ? 'access' : 'general'
}, { immediate: true })
const tabs = computed(() => [
  { label: 'Général', icon: 'i-lucide-file-text', value: 'general', slot: 'general' as const },
  { label: 'Accès et partage', icon: STATUS_CONFIG[state.status].icon, value: 'access', slot: 'access' as const },
  { label: 'Variantes', icon: 'i-lucide-layers', value: 'variants', slot: 'variants' as const },
])

const projectItems = computed(() => [
  { label: 'Sans projet', value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

const themeItems = knownThemes().map(name => ({ label: name, value: name }))

// Families and replacements are chosen among the decks of the same folder.
const { presentations } = useCatalog()
const folderDecks = computed(() => presentations.value.filter(d =>
  d.slug !== props.item.slug && (d.project ?? NONE) === state.project))
const familyItems = ref<string[]>([])
watch([folderDecks, open], () => {
  familyItems.value = [...new Set(folderDecks.value.map(d => d.family).filter((f): f is string => Boolean(f)))].sort()
}, { immediate: true })
function addFamily(family: string) {
  familyItems.value.push(family)
  state.family = family
}
const replacementItems = computed(() => [
  { label: 'Aucune', value: NONE },
  ...folderDecks.value.map(d => ({ label: d.title, value: d.slug })),
])

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
    family: state.family.trim() || null,
    variantLabel: state.variantLabel.trim() || null,
    supersededBy: state.supersededBy === NONE ? null : state.supersededBy,
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
    :description="`Réglages de ${item.slug}`"
    :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <UTabs
        v-model="tab"
        :items="tabs"
        variant="link"
        :ui="{ root: 'gap-0', list: 'sticky top-0 z-10 bg-default px-4 sm:px-6', content: 'px-4 sm:px-6' }"
      >
        <!-- Each setting reads as a row: what it is on the left, its control on
             the right. -->
        <template #general>
          <div class="settings">
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Titre
                </p>
              </div>
              <UInput
                v-model="state.title"
                class="w-full"
                aria-label="Titre"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Dossier
                </p>
                <p class="settings__hint">
                  Où la présentation est rangée dans le catalogue.
                </p>
              </div>
              <USelect
                v-model="state.project"
                :items="projectItems"
                class="w-full"
                aria-label="Dossier"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Thème
                </p>
              </div>
              <USelect
                v-model="state.theme"
                :items="[{ label: 'Par défaut (dsfr)', value: NONE }, ...themeItems]"
                class="w-full"
                aria-label="Thème"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Adresse stable
                </p>
                <p class="settings__hint">
                  Un lien qui ne change pas si l'identifiant change. Vide, la présentation n'en a pas.
                </p>
              </div>
              <UInput
                v-model="state.alias"
                placeholder="mon-alias"
                class="w-full font-mono"
                :ui="{ base: 'ps-9', leading: 'ps-3' }"
                aria-label="Alias"
              >
                <template #leading>
                  <span class="text-sm text-dimmed">/p/</span>
                </template>
              </UInput>
            </div>
          </div>
        </template>

        <template #access>
          <div class="settings">
            <UAlert
              class="mt-4"
              color="neutral"
              variant="subtle"
              icon="i-lucide-eye"
              title="Qui peut ouvrir cette présentation"
              :description="audience"
            />
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Visibilité
                </p>
              </div>
              <div class="flex flex-col gap-3">
                <URadioGroup
                  v-model="state.status"
                  :items="statusItems"
                  variant="card"
                  :ui="{ fieldset: 'gap-2' }"
                  aria-label="Visibilité"
                />
                <template v-if="state.status === 'semi-private'">
                  <UInput
                    v-model="state.password"
                    type="password"
                    :placeholder="item.hasPassword ? 'Nouveau mot de passe (8 caractères minimum)' : 'Mot de passe (8 caractères minimum)'"
                    class="w-full"
                    aria-label="Mot de passe"
                  />
                  <p
                    v-if="item.hasPassword"
                    class="settings__hint"
                  >
                    Un mot de passe est défini. Saisissez-en un nouveau pour le remplacer.
                  </p>
                  <UAlert
                    v-if="passwordMissing"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-triangle-alert"
                    title="Sans mot de passe, la présentation serait inaccessible à tous."
                  />
                </template>
              </div>
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Non répertoriée
                </p>
                <p class="settings__hint">
                  Accessible par lien mais absente du catalogue.
                </p>
              </div>
              <USwitch
                v-model="state.unlisted"
                aria-label="Non répertoriée"
              />
            </div>

            <div
              v-if="isOwner"
              ref="sharingSection"
              tabindex="-1"
              class="settings__row outline-none"
            >
              <div>
                <p class="settings__label">
                  Accès individuels
                </p>
                <p class="settings__hint">
                  Ouvrent la présentation à un compte précis, au-delà de sa visibilité. Chaque accès s'applique dès son ajout.
                </p>
              </div>
              <div class="flex flex-col gap-3">
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
              </div>
            </div>
          </div>
        </template>

        <template #variants>
          <div class="settings">
            <p class="settings__hint pt-4">
              Les variantes d'une même présentation, par langue ou par format, partagent une carte dans le dossier et se rejoignent depuis le lecteur. Une édition remplacée passe dans les éditions remplacées du dossier.
            </p>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Famille
                </p>
                <p class="settings__hint">
                  Le nom commun des variantes.
                </p>
              </div>
              <UInputMenu
                v-model="state.family"
                :items="familyItems"
                create-item
                placeholder="Aucune"
                class="w-full"
                aria-label="Famille"
                @create="addFamily"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Variante
                </p>
                <p class="settings__hint">
                  Le libellé de cette variante sur la carte et dans le lecteur : FR, EN, Vidéo…
                </p>
              </div>
              <UInput
                v-model="state.variantLabel"
                class="w-full"
                aria-label="Variante"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  Remplacée par
                </p>
                <p class="settings__hint">
                  La présentation passe dans les éditions remplacées du dossier.
                </p>
              </div>
              <USelect
                v-model="state.supersededBy"
                :items="replacementItems"
                class="w-full"
                aria-label="Remplacée par"
              />
            </div>
          </div>
        </template>
      </UTabs>
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

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  padding-bottom: 1.5rem;
}

.settings__row {
  display: grid;
  gap: 0.5rem 1.5rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--ui-border);
}

.settings__row:last-child {
  border-bottom: 0;
}

@media (min-width: 640px) {
  .settings__row {
    grid-template-columns: 13rem 1fr;
    align-items: start;
  }
}

.settings__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-text-highlighted);
}

.settings__hint {
  margin-top: 0.125rem;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
}
</style>
