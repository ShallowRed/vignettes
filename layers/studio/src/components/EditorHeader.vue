<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { Peer } from '../utils/editor-peers'
import { useAppSession } from '../composables/useAppSession'
import { peerInitials } from '../utils/editor-peers'

/**
 * The header of the editor. The way back reads as on the catalog pages. On the
 * right, in reading order: who edits, the versions of the deck, its settings,
 * then the account. The draft's state shows while the shared draft is not
 * connected. Publishing sits in the bar of the preview.
 */
defineProps<{
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
  /** The account may edit the deck, so it may open its settings on the sharing. */
  canEdit: boolean
}>()

const emit = defineEmits<{
  save: []
  settings: []
  versions: []
}>()

const { t } = useI18n()
const { privileged } = useAppSession()

// The header buttons show their label from the `sm` width; below it they keep
// their icon, with the padding of an icon button, and their tooltip and
// accessible name carry the label.
const HEADER_LABEL = 'hidden sm:inline'
const HEADER_BUTTON_UI = { base: 'max-sm:px-1.5', label: HEADER_LABEL }
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

    <!-- The shared draft's state, while it is not connected, and the way to
         the solo editor once the connection is lost. -->
    <template v-if="collab && collabStatus !== 'connected'">
      <span
        class="inline-flex items-center gap-1.5 text-xs"
        :class="indicator.labelClass"
      >
        <UIcon
          :name="indicator.icon"
          class="size-4 shrink-0"
          :class="indicator.class"
        />
        <span :class="HEADER_LABEL">{{ indicator.label }}</span>
      </span>
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
    <template v-else-if="!collab && writable">
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

    <UButton
      v-if="writable"
      :label="t('editor.page.versions')"
      :aria-label="t('editor.page.versions')"
      :ui="HEADER_BUTTON_UI"
      icon="i-lucide-history"
      color="neutral"
      variant="ghost"
      size="sm"
      class="shrink-0"
      @click="emit('versions')"
    />
    <UButton
      :label="t('editor.page.settings')"
      :aria-label="t('editor.page.settings')"
      :ui="HEADER_BUTTON_UI"
      icon="i-lucide-settings-2"
      color="neutral"
      variant="ghost"
      size="sm"
      class="shrink-0"
      :disabled="!privileged && !canEdit"
      @click="emit('settings')"
    />

    <USeparator
      orientation="vertical"
      class="h-6"
    />

    <AccountMenu />
  </header>
</template>
