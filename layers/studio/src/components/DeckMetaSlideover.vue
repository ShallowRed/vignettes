<script setup lang="ts">
import type { GrantSummary, PublicationStatus } from '#shared/access'
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { isExpired, PUBLICATION_STATUSES, sharingLimit } from '#shared/access'
import { STATUS_CONFIG } from '#shared/presentations'
import { useMutation, useQuery } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { slugify } from '@vignettes/core/slugify'
import { deckApi } from '../api'
import { useAppSession } from '../composables/useAppSession'
import { useCatalog, useCatalogCache } from '../composables/useCatalog'
import { useSharing } from '../composables/useSharing'
import { grantsQuery } from '../queries'
import { countAudience } from '../utils/audience'
import { requestErrorMessage } from '../utils/request-error'
import { shortDate } from '../utils/short-date'

/**
 * Deck settings panel, in three tabs: the deck itself (folder, address), who can
 * open it (visibility, catalog, sharing grants) and its variants. Metadata saves
 * through the admin PATCH, for the global roles; grants apply as soon as they
 * are added, for whoever may share the deck (`item.canShare`). A collaborator
 * holding an `editor` grant reads the access tab alone: who can open the deck,
 * and its grants. Reused by the catalog and the editor. The title and the theme
 * are read here: they belong to the deck's frontmatter, which each publication
 * re-reads.
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

const { role, privileged, user } = useAppSession()
const isOwner = computed(() => role.value === 'owner')
const canShare = computed(() => props.item.canShare === true)
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
    tab.value = props.focus === 'sharing' || !privileged.value ? 'access' : 'general'
}, { immediate: true })
const accessTab = computed(() => ({ label: t('deck.meta.tabAccess'), icon: passwordMissing.value ? 'i-lucide-triangle-alert' : STATUS_CONFIG[state.status].icon, value: 'access', slot: 'access' as const }))
const tabs = computed(() => privileged.value
  ? [
      { label: t('deck.meta.tabGeneral'), icon: 'i-lucide-file-text', value: 'general', slot: 'general' as const },
      accessTab.value,
      { label: t('deck.meta.tabVariants'), icon: 'i-lucide-layers', value: 'variants', slot: 'variants' as const },
    ]
  : [accessTab.value])

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

// A slug stays as typed; any other text becomes one, since the alias names a path segment of `/p/`.
function aliasOf(text: string): string {
  const trimmed = text.trim()
  return isDeckSlug(trimmed) ? trimmed : slugify(trimmed, { lower: true, strict: true })
}

function close() {
  open.value = false
}

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () => deckApi.updateMeta($fetch, props.item.slug, {
    status: state.status,
    unlisted: state.unlisted,
    project: state.project === NONE ? null : state.project,
    alias: aliasOf(state.alias) || null,
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

// ── Sharing (per-deck grants, whoever may share the deck) ───────────────────
// Delegated to the shared `useSharing`; grants load only while the panel is open
// for a sharer, and the account list for the owner alone. The whole bag also
// feeds ShareGrantForm.
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

// The end of the sharer's own access, read from the two lists below once both
// loaded (undefined until then).
const ownLimit = shallowRef<Date | null | undefined>(undefined)
const sharing = useSharing(() => ({ kind: 'deck', slug: props.item.slug }), () => open.value && canShare.value, () => isOwner.value, () => ownLimit.value)
const { grants, grantsStatus, refetchGrants, grantRoleItemsOf, changeGrantRole, removeGrant, busy: sharingBusy } = sharing

// The folder's master keys open this deck too: surface them here (read-only,
// same cache key as the folder panel, read through this deck) so this panel
// cannot claim "no access" while the whole folder is shared.
const requestFetch = useRequestFetch()
const projectGrantsQ = useQuery({
  ...grantsQuery(requestFetch, () => ({ kind: 'project', slug: props.item.project! }), () => props.item.slug),
  enabled: () => open.value && canShare.value && !!props.item.project,
})
const projectGrants = computed<GrantSummary[]>(() =>
  props.item.project ? (projectGrantsQ.data.value ?? []) : [])

// The server refuses a sharer other than the owner their own grant.
const isOwn = (grant: GrantSummary) => grant.login.toLowerCase() === user.value?.login?.toLowerCase()
const isOwnGrant = (grant: GrantSummary) => !isOwner.value && isOwn(grant)
const folderGrantsStatus = computed(() => props.item.project ? projectGrantsQ.status.value : 'success')
watchEffect(() => {
  const loaded = grantsStatus.value === 'success' && folderGrantsStatus.value === 'success'
  ownLimit.value = privileged.value
    ? null
    : loaded ? sharingLimit(role.value, [grants.value.find(isOwn), projectGrants.value.find(isOwn)]) : undefined
})
const loadFailures = computed(() => [
  ...(grantsStatus.value === 'error' ? [{ title: t('deck.sharing.loadFailed'), retry: () => { refetchGrants() } }] : []),
  ...(folderGrantsStatus.value === 'error' ? [{ title: t('deck.sharing.folderLoadFailed'), retry: () => { projectGrantsQ.refetch() } }] : []),
])

// One sentence answering "who can open this deck?", folding status, password
// and both grant scopes — the recomposition the three separate panels lack.
const audience = computed(() => {
  const base = state.status === 'public'
    ? 'public'
    : state.status === 'semi-private'
      ? (props.item.hasPassword || passwordReady.value ? 'password' : 'noPassword')
      : 'private'
  const count = countAudience(
    grantsStatus.value === 'error' ? undefined : grants.value,
    folderGrantsStatus.value === 'error' ? undefined : projectGrants.value,
  )
  const key = `deck.meta.audience.${base}.${count.variant}`
  if (count.variant === 'both')
    return t(key, { folder: count.folder }, count.direct)
  if (count.variant === 'direct')
    return t(key, count.direct)
  if (count.variant === 'folder')
    return t(key, { folder: count.folder })
  return t(key)
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="item.title"
    :description="privileged ? t('deck.meta.description', { slug: item.slug }) : t('deck.meta.sharingDescription', { slug: item.slug })"
    :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <UTabs
        v-model="tab"
        :items="tabs"
        variant="link"
        :ui="{ root: 'gap-0', list: privileged ? 'sticky top-0 z-10 bg-default px-4 sm:px-6' : 'hidden', content: 'px-4 sm:px-6' }"
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
                <i18n-t
                  keypath="deck.meta.fromFrontmatter"
                  tag="p"
                  scope="global"
                  class="settings__hint"
                >
                  <template #key>
                    <code class="font-mono">title:</code>
                  </template>
                </i18n-t>
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
                <i18n-t
                  keypath="deck.meta.fromFrontmatter"
                  tag="p"
                  scope="global"
                  class="settings__hint"
                >
                  <template #key>
                    <code class="font-mono">theme:</code>
                  </template>
                </i18n-t>
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
                @blur="state.alias = aliasOf(state.alias)"
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
            <div
              v-if="privileged"
              class="settings__row"
            >
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
            <div
              v-if="privileged"
              class="settings__row"
            >
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
              v-if="canShare"
              ref="sharingSection"
              tabindex="-1"
              class="settings__row settings__row--stacked outline-none"
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
                <UAlert
                  v-for="failure in loadFailures"
                  :key="failure.title"
                  color="error"
                  variant="subtle"
                  icon="i-lucide-triangle-alert"
                  :title="failure.title"
                  :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'subtle', onClick: failure.retry }]"
                />
                <GrantList
                  v-if="grants.length > 0"
                  :grants="grants"
                  :role-items="grantRoleItemsOf"
                  :busy="sharingBusy"
                  :locked="isOwnGrant"
                  @change-role="changeGrantRole"
                  @remove="removeGrant"
                />
                <p
                  v-else-if="grantsStatus === 'success'"
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
                      class="flex flex-wrap items-baseline gap-x-2 text-sm"
                    >
                      <span class="break-all">{{ grant.login }}</span>
                      <span class="text-xs text-muted">{{ grant.role === 'editor' ? t('deck.sharing.roleEditor') : t('deck.sharing.roleViewer') }}</span>
                      <span
                        v-if="grant.invited"
                        class="text-xs text-dimmed"
                      >{{ t('deck.sharing.neverSignedIn') }}</span>
                      <span
                        v-if="grant.expiresAt"
                        class="text-xs"
                        :class="isExpired(grant) ? 'text-error' : 'text-dimmed'"
                      >{{ isExpired(grant) ? t('deck.sharing.expired') : t('deck.sharing.expiresOn', { date: shortDate(grant.expiresAt, locale) }) }}</span>
                    </li>
                  </ul>
                  <p class="text-xs text-dimmed">
                    {{ isOwner ? t('deck.meta.folderGrantsHint') : t('deck.meta.folderGrantsOwnerHint') }}
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

    <template
      v-if="privileged"
      #footer
    >
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

/* A grid item keeps its content width by default: let the long logins and the
   rows of controls shrink to the panel on a phone. */
.settings__row > * {
  min-width: 0;
}

@media (min-width: 640px) {
  .settings__row {
    grid-template-columns: 13rem 1fr;
    align-items: start;
  }

  /* A row whose controls need the panel's width (the sharing form) sits under its label. */
  .settings__row--stacked {
    grid-template-columns: 1fr;
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
