<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Fact } from './FactList.vue'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'
import { useDeckDownload } from '../composables/useDeckDownload'
import { shortDate } from '../utils/short-date'

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

const frozen = computed(() => isFrozen(deck.value))

// A frozen deck is read-only whatever the role.
const canEdit = computed(() => !frozen.value && (props.admin === true || deck.value.canEdit === true))
const adminMenu = computed(() => props.admin === true && !frozen.value)
// Whoever may share the deck gets the entry, a collaborator holding an `editor`
// grant included (`canShare` in the catalog payload).
const shareItems = computed<DropdownMenuItem[]>(() => deck.value.canShare && !frozen.value
  ? [{ label: t('catalog.deck.share'), icon: 'i-lucide-users', onSelect: () => emit('share', deck.value) }]
  : [])

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
  return t('catalog.card.updatedOn', { date: shortDate(new Date(at), locale.value) })
})

// What the card says under the title, in reading order.
const facts = computed<Fact[]>(() => {
  const full = !props.minimal
  const { lifecycle, status, unlisted, published, unpublishedChanges, sharedCount } = deck.value
  const list: (Fact | false | undefined)[] = [
    frozen.value && { key: 'lifecycle', text: t(lifecycle === 'archived' ? 'catalog.deck.archived' : 'catalog.deck.frozen') },
    !frozen.value && full && statusDisplay.value && status !== 'public' && { key: 'status', text: t(statusDisplay.value.labelKey) },
    full && unlisted && { key: 'unlisted', text: t('catalog.deck.unlisted') },
    full && props.admin && published === false && { key: 'unpublished', text: t('catalog.deck.unpublished') },
    full && canEdit.value && unpublishedChanges && { key: 'changes', text: t('catalog.card.unpublishedChanges'), warning: true },
    full && props.admin && sharedCount ? { key: 'shared', text: String(sharedCount), icon: 'i-lucide-users', title: t('catalog.deck.sharedAccess', sharedCount) } : false,
    Boolean(props.replacedBy) && { key: 'replacedBy', text: t('catalog.card.replacedBy', { title: props.replacedBy }) },
    full && updatedLabel.value !== undefined && { key: 'updated', text: updatedLabel.value },
  ]
  return list.filter((fact): fact is Fact => Boolean(fact))
})

const { downloadItems } = useDeckDownload()
const actions = computed<DropdownMenuItem[][]>(() => [
  ...(adminMenu.value
    ? [[
        { label: t('common.actions.edit'), icon: 'i-lucide-pencil', to: `/edit/${deck.value.slug}` },
        { label: t('catalog.deck.metadata'), icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta', deck.value) },
        ...shareItems.value,
      ]]
    : [shareItems.value]),
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
    :aria-label="deck.title"
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
              :aria-label="t('catalog.deck.actionsLabel', { title: deck.title })"
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
        <FactList
          v-if="frozen || !minimal"
          :facts="facts"
        />
      </div>
    </template>
  </UPageCard>
</template>
