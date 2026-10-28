<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { Peer } from '../utils/editor-peers'
import { STATUS_CONFIG } from '#shared/presentations'
import { useAppSession } from '../composables/useAppSession'
import { peerInitials } from '../utils/editor-peers'

/**
 * The header of the editor. The way back reads as on the catalog pages. On the
 * right, in reading order: the draft, who sees the deck, presenting it, its
 * publication, its occasional actions in one menu, then the account.
 * `capture` takes a snapshot of the shared draft (⌘S).
 */
const props = defineProps<{
  breadcrumb: BreadcrumbItem[]
  slug: string
  writable: boolean
  /** The draft is shared through the collab document. */
  collab: boolean
  collabStatus: 'connecting' | 'connected' | 'disconnected'
  peers: Peer[]
  /** What the header shows of the shared draft's state. */
  indicator: { icon: string, class: string, labelClass: string, label: string }
  /** The solo draft differs from the saved one. */
  dirty: boolean
  saving: boolean
  status: string
  /** The account may edit the deck, so it may open its settings on the sharing. */
  canEdit: boolean
  unpublished: boolean | null
  neverPublished: boolean
  publicationHint: string
  publishLabel: string
  /** The lines the draft changed since the version the visitors see. */
  changes: number
  publishing: boolean
  versionNumber: number | null
}>()

const emit = defineEmits<{
  save: []
  publish: []
  settings: []
  history: []
  download: [version: 'draft' | 'published']
}>()

const { t } = useI18n()
const { privileged } = useAppSession()

const snapshotPopover = useTemplateRef<{ capture: () => void }>('snapshotPopover')
defineExpose({ capture: () => snapshotPopover.value?.capture() })

const statusDisplay = computed(() => STATUS_CONFIG[props.status as keyof typeof STATUS_CONFIG])

// The header buttons show their label from the `sm` width; below it they keep
// their icon, with the padding of an icon button, and their tooltip and
// accessible name carry the label.
const HEADER_LABEL = 'hidden sm:inline'
const HEADER_BUTTON_UI = { base: 'max-sm:px-1.5', label: HEADER_LABEL }

// The sentence that opens the menu wraps inside its width.
const PUBLICATION_MENU_UI = { content: 'w-80', label: 'font-normal text-muted', itemLabel: 'whitespace-normal' }

// The menu of the publication: what the visitors see, then the changes, the
// snapshots and the history of the deck.
const publicationItems = computed(() => [
  [{ type: 'label' as const, label: props.publicationHint }],
  [
    ...(props.unpublished && !props.neverPublished ? [{ label: t('editor.publication.changes'), icon: 'i-lucide-git-compare', onSelect: () => emit('history') }] : []),
    ...(props.collab ? [{ label: t('editor.publication.snapshot'), icon: 'i-lucide-camera', onSelect: () => snapshotPopover.value?.capture() }] : []),
    { label: t('editor.publication.history'), icon: 'i-lucide-history', onSelect: () => emit('history') },
  ],
])

// The occasional actions on the deck: its settings, its files. The draft is the
// text in the editor, saved or not; the published version is the one the page loaded.
const deckMenuItems = computed(() => [
  ...(statusDisplay.value ? [[{ label: t('editor.page.settings'), icon: 'i-lucide-settings-2', disabled: !privileged.value && !props.canEdit, onSelect: () => emit('settings') }]] : []),
  [
    { type: 'label' as const, label: t('editor.page.download') },
    { label: t('editor.page.downloadDraft'), icon: 'i-lucide-file-pen-line', onSelect: () => emit('download', 'draft') },
    { label: t('editor.page.downloadPublished'), icon: 'i-lucide-file-down', disabled: props.neverPublished, onSelect: () => emit('download', 'published') },
  ],
])
</script>

<template>
  <header
    class="flex items-center gap-2 sm:gap-3 px-3 h-14 shrink-0 border-b border-default bg-default"
  >
    <AppTitle :items="breadcrumb" />

    <div class="flex-1" />

    <span
      v-if="!writable"
      class="text-xs text-muted"
    >{{ t('editor.page.readOnly') }}</span>

    <div
      v-if="collab"
      class="flex items-center -space-x-1"
    >
      <span
        v-for="peer in peers"
        :key="peer.key"
        class="grid place-items-center size-6 rounded-full text-[10px] font-semibold text-white ring-2 ring-default"
        :style="{ backgroundColor: peer.color }"
        :title="peer.self ? t('editor.page.selfElsewhere') : t('editor.page.peerEditing', { name: peer.name })"
      >{{ peerInitials(peer.name) }}</span>
    </div>

    <!-- The draft state opens the capture of a snapshot; a lost connection
         adds a link to the solo editor. -->
    <template v-if="collab">
      <EditorSnapshotPopover
        ref="snapshotPopover"
        :slug="slug"
        :indicator="indicator"
        :offline="collabStatus !== 'connected'"
      />
      <UButton
        v-if="collabStatus === 'disconnected'"
        :label="t('editor.collab.switchToSolo')"
        color="neutral"
        variant="link"
        size="xs"
        :to="`/edit/${slug}?solo`"
        external
      />
    </template>
    <template v-else-if="writable">
      <UTooltip :text="t('editor.collab.soloTooltip')">
        <UButton
          :label="t('editor.collab.solo')"
          :aria-label="t('editor.collab.solo')"
          :ui="HEADER_BUTTON_UI"
          icon="i-lucide-user"
          color="neutral"
          variant="link"
          size="xs"
          :to="`/edit/${slug}`"
          external
        />
      </UTooltip>
      <UChip
        :show="dirty"
        color="warning"
        size="lg"
      >
        <UButton
          :label="t('common.actions.save')"
          :aria-label="t('common.actions.save')"
          :ui="HEADER_BUTTON_UI"
          icon="i-lucide-save"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="saving"
          :disabled="!dirty"
          @click="emit('save')"
        />
      </UChip>
    </template>

    <!-- The visibility of the deck opens its settings drawer. Whoever may edit
         the deck may share it (canShare), so a collaborator opens the drawer
         on its sharing. On a phone, the menu of the deck opens the drawer. -->
    <UTooltip
      v-if="statusDisplay"
      :text="privileged ? t('editor.page.settingsTooltip') : t('editor.page.settingsTooltipSharing')"
    >
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0 gap-1.5 max-sm:hidden"
        :aria-label="`${t('editor.page.settings')}, ${t(statusDisplay.labelKey)}`"
        :disabled="!privileged && !canEdit"
        @click="emit('settings')"
      >
        <UIcon
          :name="statusDisplay.icon"
          class="size-4.5 shrink-0 text-muted"
        />
        <span class="text-xs text-muted">{{ t(statusDisplay.labelKey) }}</span>
      </UButton>
    </UTooltip>

    <!-- Publishing: the one filled button of the page, with the number of
         lines the draft changed since the version the visitors see. Once
         the draft and that version are the same, it gives the version. Its
         menu reaches the changes, the snapshots and the history. -->
    <UFieldGroup
      v-if="writable && unpublished !== false"
      class="shrink-0"
    >
      <UTooltip :text="publicationHint">
        <UButton
          icon="i-lucide-send"
          :label="t('editor.publication.publish')"
          :aria-label="publishLabel"
          :ui="HEADER_BUTTON_UI"
          :loading="publishing"
          @click="emit('publish')"
        >
          <template
            v-if="changes"
            #trailing
          >
            <span class="grid place-items-center min-w-5 h-5 px-1.5 rounded-full bg-white/25 text-xs font-semibold tabular-nums">{{ changes }}</span>
          </template>
        </UButton>
      </UTooltip>
      <UDropdownMenu
        :items="publicationItems"
        :content="{ align: 'end' }"
        :ui="PUBLICATION_MENU_UI"
      >
        <UButton
          icon="i-lucide-chevron-down"
          class="border-s border-inverted/20"
          :aria-label="t('editor.publication.menu')"
        />
      </UDropdownMenu>
    </UFieldGroup>
    <UDropdownMenu
      v-else-if="writable"
      :items="publicationItems"
      :content="{ align: 'end' }"
      :ui="PUBLICATION_MENU_UI"
    >
      <UButton
        icon="i-lucide-check"
        trailing-icon="i-lucide-chevron-down"
        :label="versionNumber ? t('editor.publication.upToDateVersion', { version: versionNumber }) : t('editor.publication.upToDate')"
        :ui="HEADER_BUTTON_UI"
        color="success"
        variant="soft"
        class="shrink-0"
      />
    </UDropdownMenu>

    <UDropdownMenu
      :items="deckMenuItems"
      :content="{ align: 'end' }"
    >
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0"
        :aria-label="t('editor.page.more')"
      />
    </UDropdownMenu>

    <USeparator
      orientation="vertical"
      class="h-6"
    />

    <AccountMenu />
  </header>
</template>
