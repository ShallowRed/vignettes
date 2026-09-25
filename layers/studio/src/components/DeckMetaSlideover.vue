<script setup lang="ts">
import type { GrantSummary, PublicationStatus } from '#shared/access'
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { PUBLICATION_STATUSES } from '#shared/access'
import { STATUS_CONFIG } from '#shared/presentations'
import { useMutation, useQuery } from '@pinia/colada'
import { deckApi } from '../api'
import { useAppSession } from '../composables/useAppSession'
import { useCatalog, useCatalogCache } from '../composables/useCatalog'
import { useSharing } from '../composables/useSharing'
import { grantsQuery } from '../queries'
import { requestErrorMessage } from '../utils/request-error'

/**
 * Deck settings panel, in three tabs: the deck itself (folder, address), who can
 * open it (visibility, catalog, sharing grants for the owner) and its variants.
 * Metadata saves through the admin PATCH; grants apply as soon as they are
 * added. Reused by the catalog and the editor. The title and the theme are read
 * here: they belong to the deck's frontmatter, which each publication re-reads.
 */
const props = defineProps<{
  item: PresentationListItem
  projects?: Project[]
  /** Section to bring into view when the panel opens. */
  focus?: 'sharing'
}>()

const emit = defineEmits<{ saved: [] }>()

const { t, locale } = useI18n()

const open = defineModel<boolean>('open', { required: true })

const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')
const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

// A non-empty sentinel marks "none" in the selects (reka-ui forbids an
// empty-string SelectItem value); mapped back to null (clear column) at PATCH time.
const NONE = '__none__'

const state = reactive({
  status: 'private' as PublicationStatus,
  unlisted: false,
  project: NONE,
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
      status: props.item.status,
      unlisted: props.item.unlisted ?? false,
      project: props.item.project ?? NONE,
      alias: props.item.alias ?? '',
      family: props.item.family ?? '',
      variantLabel: props.item.variantLabel ?? '',
      supersededBy: props.item.supersededBy ?? NONE,
      password: '',
    })
  }
}, { immediate: true })

// The server fail-closes a semi-private deck with no hash: block the save that
// would put a deck in that state. A deck already in it keeps its other settings
// editable, and the warning stays until a password is typed.
const passwordReady = computed(() => state.password.trim().length >= 8)
const passwordMissing = computed(() =>
  state.status === 'semi-private' && !props.item.hasPassword && !passwordReady.value)
const saveBlocked = computed(() => passwordMissing.value && props.item.status !== 'semi-private')

const STATUS_DESCRIPTION_KEYS: Record<PublicationStatus, string> = {
  'public': 'deck.meta.statusDescription.public',
  'semi-private': 'deck.meta.statusDescription.semiPrivate',
  'private': 'deck.meta.statusDescription.private',
}
const statusItems = computed(() => PUBLICATION_STATUSES.map(status => ({
  label: t(STATUS_CONFIG[status].labelKey),
  description: t(STATUS_DESCRIPTION_KEYS[status]),
  value: status,
})))

type Tab = 'general' | 'access' | 'variants'
const tab = ref<Tab>('general')
watch(open, (now) => {
  if (now)
    tab.value = props.focus === 'sharing' ? 'access' : 'general'
}, { immediate: true })
const tabs = computed(() => [
  { label: t('deck.meta.tabGeneral'), icon: 'i-lucide-file-text', value: 'general', slot: 'general' as const },
  { label: t('deck.meta.tabAccess'), icon: passwordMissing.value ? 'i-lucide-triangle-alert' : STATUS_CONFIG[state.status].icon, value: 'access', slot: 'access' as const },
  { label: t('deck.meta.tabVariants'), icon: 'i-lucide-layers', value: 'variants', slot: 'variants' as const },
])

const projectItems = computed(() => [
  { label: t('deck.meta.noFolder'), value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

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
  { label: t('deck.meta.noReplacement'), value: NONE },
  ...folderDecks.value.map(d => ({ label: d.title, value: d.slug })),
])

function close() {
  open.value = false
}

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () => deckApi.updateMeta($fetch, props.item.slug, {
    status: state.status,
    unlisted: state.unlisted,
    project: state.project === NONE ? null : state.project,
    alias: state.alias.trim() || null,
    family: state.family.trim() || null,
    variantLabel: state.variantLabel.trim() || null,
    supersededBy: state.supersededBy === NONE ? null : state.supersededBy,
    ...(passwordReady.value ? { accessPassword: state.password.trim() } : {}),
  }),
  async onSuccess() {
    toast.add({ title: t('deck.meta.saved'), icon: 'i-lucide-check', color: 'success' })
    await invalidatePresentations()
    open.value = false
    emit('saved')
  },
  onError(e: any) {
    toast.add({ title: requestErrorMessage(e, t('deck.meta.saveFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
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
    ? 'public'
    : state.status === 'semi-private'
      ? (props.item.hasPassword || passwordReady.value ? 'password' : 'noPassword')
      : 'private'
  const direct = grants.value.length
  const folder = projectGrants.value.length
  if (direct && folder)
    return t(`deck.meta.audience.${base}.both`, { folder }, direct)
  if (direct)
    return t(`deck.meta.audience.${base}.direct`, direct)
  if (folder)
    return t(`deck.meta.audience.${base}.folder`, { folder })
  return t(`deck.meta.audience.${base}.alone`)
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="item.title"
    :description="t('deck.meta.description', { slug: item.slug })"
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
                  {{ t('common.fields.title') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.fromFrontmatter') }}
                </p>
              </div>
              <p class="settings__value">
                {{ item.title }}
              </p>
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.folder') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.folderHint') }}
                </p>
              </div>
              <USelect
                v-model="state.project"
                :items="projectItems"
                class="w-full"
                :aria-label="t('deck.meta.folder')"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.theme') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.fromFrontmatter') }}
                </p>
              </div>
              <p class="settings__value">
                {{ item.theme }}
              </p>
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.stableAddress') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.stableAddressHint') }}
                </p>
              </div>
              <UInput
                v-model="state.alias"
                :placeholder="t('deck.meta.aliasPlaceholder')"
                class="w-full font-mono"
                :ui="{ base: 'ps-9', leading: 'ps-3' }"
                :aria-label="t('deck.meta.alias')"
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
              :title="t('deck.meta.audienceTitle')"
              :description="audience"
            />
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.visibility') }}
                </p>
              </div>
              <div class="flex flex-col gap-3">
                <URadioGroup
                  v-model="state.status"
                  :items="statusItems"
                  variant="card"
                  :ui="{ fieldset: 'gap-2' }"
                  :aria-label="t('deck.meta.visibility')"
                />
                <template v-if="state.status === 'semi-private'">
                  <UInput
                    v-model="state.password"
                    type="password"
                    :placeholder="item.hasPassword ? t('deck.meta.newPasswordPlaceholder') : t('deck.meta.passwordPlaceholder')"
                    class="w-full"
                    :aria-label="t('deck.meta.password')"
                  />
                  <p
                    v-if="item.hasPassword"
                    class="settings__hint"
                  >
                    {{ t('deck.meta.passwordDefinedHint') }}
                  </p>
                  <UAlert
                    v-if="passwordMissing"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-triangle-alert"
                    :title="t('deck.meta.passwordMissingWarning')"
                  />
                </template>
              </div>
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.unlisted') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.unlistedHint') }}
                </p>
              </div>
              <USwitch
                v-model="state.unlisted"
                :aria-label="t('deck.meta.unlisted')"
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
                  {{ t('deck.meta.grants') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.grantsHint') }}
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
                      :disabled="sharingBusy"
                      :aria-label="t('deck.sharing.removeGrant')"
                      @click="removeGrant(grant.userId)"
                    />
                  </li>
                </ul>
                <p
                  v-else
                  class="text-sm text-dimmed"
                >
                  {{ t('deck.meta.noGrants') }}
                </p>

                <div
                  v-if="projectGrants.length"
                  class="rounded-lg bg-muted p-3 flex flex-col gap-2"
                >
                  <p class="text-xs font-medium text-muted uppercase tracking-wide">
                    {{ t('deck.meta.folderGrants') }}
                  </p>
                  <ul class="flex flex-col gap-1">
                    <li
                      v-for="grant in projectGrants"
                      :key="grant.userId"
                      class="flex items-center gap-2 text-sm"
                    >
                      <span>{{ grant.login }}</span>
                      <span class="text-xs text-muted">{{ grant.role === 'editor' ? t('deck.sharing.roleEditor') : t('deck.sharing.roleViewer') }}</span>
                      <span
                        v-if="grant.invited"
                        class="text-xs text-dimmed"
                      >· {{ t('deck.sharing.neverSignedIn') }}</span>
                    </li>
                  </ul>
                  <p class="text-xs text-dimmed">
                    {{ t('deck.meta.folderGrantsHint') }}
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
              {{ t('deck.meta.variantsIntro') }}
            </p>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.family') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.familyHint') }}
                </p>
              </div>
              <UInputMenu
                v-model="state.family"
                :items="familyItems"
                create-item
                :placeholder="t('deck.meta.noFamily')"
                class="w-full"
                :aria-label="t('deck.meta.family')"
                @create="addFamily"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.variant') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.variantHint') }}
                </p>
              </div>
              <UInput
                v-model="state.variantLabel"
                class="w-full"
                :aria-label="t('deck.meta.variant')"
              />
            </div>
            <div class="settings__row">
              <div>
                <p class="settings__label">
                  {{ t('deck.meta.supersededBy') }}
                </p>
                <p class="settings__hint">
                  {{ t('deck.meta.supersededByHint') }}
                </p>
              </div>
              <USelect
                v-model="state.supersededBy"
                :items="replacementItems"
                class="w-full"
                :aria-label="t('deck.meta.supersededBy')"
              />
            </div>
          </div>
        </template>
      </UTabs>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <p
          v-if="saveBlocked"
          class="settings__hint mr-auto"
        >
          {{ t('deck.meta.passwordMissingWarning') }}
        </p>
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          :label="t('common.actions.save')"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="saveBlocked"
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

/* A value the deck's frontmatter sets, aligned with the inputs of the other rows. */
.settings__value {
  align-self: center;
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
</style>
