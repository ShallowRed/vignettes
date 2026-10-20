<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'
import { useAppSession } from '../composables/useAppSession'
import { useDeckDownload } from '../composables/useDeckDownload'

// Catalog card. `admin` adds management details and the management entries of
// the actions menu (privileged roles only). Editing is separate: it follows the deck's own `canEdit`, so a
// collaborator holding an `editor` grant gets the pencil without the rest.
const props = defineProps<{
  presentation: PresentationListItem
  admin?: boolean
  /** Showcase card: title-first, no status/theme chrome (everything shown is public). */
  minimal?: boolean
  /** The variants of the presentation's family, most recent first; the card switches between them. */
  variants?: PresentationListItem[]
  /** Title of the deck that replaces this one. */
  replacedBy?: string
}>()

const emit = defineEmits<{
  editMeta: [deck: PresentationListItem]
  share: [deck: PresentationListItem]
  duplicate: [deck: PresentationListItem, mode: 'variant' | 'edition']
  remove: [deck: PresentationListItem]
}>()

const { t, locale } = useI18n()

const selectedSlug = ref(props.presentation.slug)
// The actions stay visible while their menu is open, the pointer being on the menu.
const menuOpen = ref(false)
const deck = computed(() => props.variants?.find(v => v.slug === selectedSlug.value) ?? props.presentation)

// Sharing is owner-only server-side, so the entry only shows for an owner.
const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')

const frozen = computed(() => isFrozen(deck.value))

// A frozen deck is read-only whatever the role.
const canEdit = computed(() => !frozen.value && (props.admin === true || deck.value.canEdit === true))
const adminMenu = computed(() => props.admin === true && !frozen.value)

const to = computed(() => {
  // Nothing to show yet: send whoever may edit it straight to the editor.
  if (canEdit.value && deck.value.published === false)
    return `/edit/${deck.value.slug}`
  return deckPath(deck.value)
})

const statusDisplay = computed(() => STATUS_CONFIG[deck.value.status])

const opensDeck = computed(() => to.value !== `/edit/${deck.value.slug}`)

const updatedLabel = computed(() => {
  const at = deck.value.updatedAt
  if (!at)
    return undefined
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return t('catalog.card.updatedOn', { date: date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }) })
})

const { downloadItems } = useDeckDownload()
const actions = computed<DropdownMenuItem[][]>(() => [
  ...(adminMenu.value
    ? [[
        { label: t('catalog.deck.editContent'), icon: 'i-lucide-pencil', to: `/edit/${deck.value.slug}` },
        { label: t('catalog.deck.metadata'), icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta', deck.value) },
        ...(isOwner.value ? [{ label: t('catalog.deck.share'), icon: 'i-lucide-users', onSelect: () => emit('share', deck.value) }] : []),
      ]]
    : []),
  downloadItems(deck.value, canEdit.value),
  ...(adminMenu.value
    ? [
        [
          { label: t('catalog.deck.createVariant'), icon: 'i-lucide-languages', onSelect: () => emit('duplicate', deck.value, 'variant') },
          { label: t('catalog.deck.newEdition'), icon: 'i-lucide-copy-plus', onSelect: () => emit('duplicate', deck.value, 'edition') },
        ],
        [
          {
            label: t('catalog.deck.delete'),
            icon: 'i-lucide-trash-2',
            color: 'error' as const,
            onSelect: () => emit('remove', deck.value),
          },
        ],
      ]
    : []),
].filter(group => group.length > 0))
const hasMenu = computed(() => actions.value.length > 0)
const hasActions = computed(() => canEdit.value || hasMenu.value)
</script>

<template>
  <UPageCard
    :to="to"
    variant="outline"
    :ui="{
      root: `group overflow-hidden ${replacedBy ? 'opacity-70 hover:opacity-100 ' : ''}ring-0 border-0 shadow-sm hover:shadow-md hover:bg-accented transition-all duration-200`,
      container: 'p-0 sm:p-0 gap-y-0',
      wrapper: 'w-full',
      body: 'w-full',
    }"
  >
    <template #body>
      <DeckPreview
        :preview="deck.preview"
        :fallback-title="deck.title"
      >
        <!-- Actions pinned to the miniature's top-right corner, shown on hover or
             focus (z-10 clears the stretched-link overlay). -->
        <div
          v-if="hasActions"
          class="absolute top-2 right-2 z-10 flex items-center gap-1 transition-opacity"
          :class="menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'"
          @click.stop.prevent
        >
          <UButton
            v-if="canEdit"
            icon="i-lucide-pencil"
            :label="t('common.actions.edit')"
            color="neutral"
            variant="outline"
            size="xs"
            class="bg-default/90 backdrop-blur-sm hover:bg-accented active:bg-accented active:ring-inverted/40 active:scale-95 transition"
            :to="`/edit/${deck.slug}`"
          />
          <UDropdownMenu
            v-if="hasMenu"
            v-model:open="menuOpen"
            :items="actions"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="outline"
              size="xs"
              class="bg-default/90 backdrop-blur-sm hover:bg-accented active:bg-accented active:ring-inverted/40 active:scale-95 transition data-[state=open]:bg-accented"
              :aria-label="t('catalog.card.actionsLabel')"
            />
          </UDropdownMenu>
        </div>
        <span
          v-if="opensDeck && deck.preview"
          class="absolute left-2 bottom-2 flex items-center gap-1.5 rounded-full bg-inverted/85 px-3 py-1.5 text-xs font-semibold text-inverted opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        >
          <UIcon
            name="i-lucide-play"
            class="size-3.5"
          />
          {{ t('catalog.card.present') }}
        </span>
        <span
          v-if="deck.slideCount"
          class="absolute right-0 bottom-0 bg-inverted px-2 py-1 font-mono text-[11px] leading-none tabular-nums text-inverted pointer-events-none"
        >{{ deck.slideCount }}<span class="sr-only">{{ ` ${t('catalog.card.slides', deck.slideCount)}` }}</span></span>
      </DeckPreview>

      <div class="flex flex-col gap-2 p-4">
        <h2 class="font-semibold text-highlighted leading-snug line-clamp-2">
          {{ deck.title }}
        </h2>

        <div
          v-if="variants && variants.length > 1"
          class="relative z-10 flex flex-wrap gap-1.5"
          role="group"
          :aria-label="t('catalog.card.variantsLabel')"
        >
          <UButton
            v-for="variant in variants"
            :key="variant.slug"
            :label="variant.variantLabel ?? variant.slug"
            size="xs"
            :color="variant.slug === deck.slug ? 'primary' : 'neutral'"
            :variant="variant.slug === deck.slug ? 'soft' : 'outline'"
            :aria-pressed="variant.slug === deck.slug"
            @click.stop.prevent="() => { selectedSlug = variant.slug }"
          />
        </div>

        <!-- Taxonomies stripped to plain text (clean base): no colour, no icon. -->
        <div
          v-if="frozen || !minimal"
          class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted"
        >
          <span v-if="frozen">{{ deck.lifecycle === 'archived' ? t('catalog.deck.archived') : t('catalog.deck.frozen') }}</span>
          <span v-else-if="!minimal && statusDisplay && deck.status !== 'public'">{{ t(statusDisplay.labelKey) }}</span>
          <span v-if="!minimal && deck.unlisted">{{ t('catalog.deck.unlisted') }}</span>
          <span v-if="!minimal && admin && deck.published === false">{{ t('catalog.deck.unpublished') }}</span>
          <span
            v-if="!minimal && canEdit && deck.unpublishedChanges"
            class="text-warning"
          >{{ t('catalog.card.unpublishedChanges') }}</span>
          <span
            v-if="!minimal && admin && deck.sharedCount"
            class="inline-flex items-center gap-0.5"
            :title="t('catalog.deck.sharedAccess', deck.sharedCount)"
          >
            <UIcon
              name="i-lucide-users"
              class="size-3"
            />
            {{ deck.sharedCount }}
          </span>
          <span v-if="replacedBy">{{ t('catalog.card.replacedBy', { title: replacedBy }) }}</span>
          <span v-if="!minimal && updatedLabel">{{ updatedLabel }}</span>
        </div>
      </div>
    </template>
  </UPageCard>
</template>
