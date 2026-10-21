<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { TableColumn } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'
import { getPaginationRowModel } from '@tanstack/vue-table'
import { h, resolveComponent } from 'vue'
import { useDeckDownload } from '../composables/useDeckDownload'
import { saveTextFile } from '../utils/save-file'

// Table view of the catalog: column sorting, client pagination, row selection
// with bulk actions. Receives the already-filtered list (toolbar owns filtering).
const props = defineProps<{
  items: PresentationListItem[]
  admin?: boolean
  projects?: Project[]
}>()

const emit = defineEmits<{
  editMeta: [item: PresentationListItem]
  share: [item: PresentationListItem]
  duplicate: [item: PresentationListItem, mode: 'variant' | 'edition']
  remove: [item: PresentationListItem]
}>()

const { t } = useI18n()

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const toast = useToast()
const { downloadItems } = useDeckDownload()

/**
 * What this component reads of the table instance. Naming it breaks the circular
 * inference between the rows and the columns that read the selection.
 */
interface CatalogTableInstance {
  tableApi?: {
    getFilteredSelectedRowModel: () => { rows: { original: PresentationListItem }[] }
    getFilteredRowModel: () => { rows: unknown[] }
    setPageIndex: (index: number) => void
    setPagination: (pagination: { pageIndex: number, pageSize: number }) => void
  }
}

const table = useTemplateRef<CatalogTableInstance>('table')

const PAGE_SIZE_KEY = 'vignettes:catalog-page-size'
const PAGE_SIZES = [10, 25, 50, 100]

const sorting = ref([{ id: 'title', desc: false }])
const rowSelection = ref<Record<string, boolean>>({})
const pagination = ref({ pageIndex: 0, pageSize: 10 })

// State changes must go through tableApi: mutating the v-model ref directly
// does not reach TanStack (the ref only receives write-backs).
function setPage(page: number) {
  table.value?.tableApi?.setPageIndex(page - 1)
}

function setPageSize(size: number) {
  // Single atomic update: two successive tableApi calls race (the second reads
  // the pre-writeback state and clobbers the first).
  table.value?.tableApi?.setPagination({ pageIndex: 0, pageSize: size })
  localStorage.setItem(PAGE_SIZE_KEY, String(size))
}

onMounted(() => {
  const stored = Number(localStorage.getItem(PAGE_SIZE_KEY))
  if (PAGE_SIZES.includes(stored))
    table.value?.tableApi?.setPagination({ pageIndex: 0, pageSize: stored })
})

// Filter changes shrink the row set: snap back to the first page and drop
// selections that may no longer be visible.
watch(() => props.items, () => {
  table.value?.tableApi?.setPageIndex(0)
  rowSelection.value = {}
})

function defaultDeckTarget(item: PresentationListItem) {
  if (props.admin && item.published === false && !isFrozen(item))
    return `/edit/${item.slug}`
  return deckPath(item)
}

const projectMeta = computed(() => new Map(
  (props.projects ?? []).map(p => [p.slug, { title: p.title ?? p.slug, color: p.color }]),
))

function sortableHeader(label: string) {
  return ({ column }: any) => {
    const sorted = column.getIsSorted()
    return h(UButton, {
      label,
      color: 'neutral',
      variant: 'ghost',
      size: 'sm',
      class: '-mx-2.5 font-semibold',
      trailingIcon: sorted === 'asc'
        ? 'i-lucide-arrow-up-narrow-wide'
        : sorted === 'desc'
          ? 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
      onClick: () => column.toggleSorting(sorted === 'asc'),
    })
  }
}

// Interactive cells (checkbox, actions) live inside clickable rows: stop the
// click before the row-level @select navigation fires.
function stopRowClick(e: Event) {
  e.stopPropagation()
}

const columns = computed<TableColumn<PresentationListItem>[]>(() => [
  {
    id: 'select',
    // Symmetric padding around the checkbox: the default `pe-0` makes the row-hover
    // highlight look lopsided (16px left, 0 right).
    meta: { class: { td: '[&:has([role=checkbox])]:!px-4', th: '[&:has([role=checkbox])]:!px-4' } },
    header: ({ table: api }) => h(UCheckbox, {
      'modelValue': api.getIsSomePageRowsSelected() ? 'indeterminate' : api.getIsAllPageRowsSelected(),
      'aria-label': t('catalog.table.selectAll'),
      'onUpdate:modelValue': (v: boolean | 'indeterminate') => api.toggleAllPageRowsSelected(!!v),
    }),
    cell: ({ row }) => h('div', { onClick: stopRowClick, class: 'flex' }, [
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'aria-label': t('catalog.table.selectRow', { title: row.original.title }),
        'onUpdate:modelValue': (v: boolean | 'indeterminate') => row.toggleSelected(!!v),
      }),
    ]),
  },
  // On a phone the title wraps on two lines, where the other columns keep one.
  { accessorKey: 'title', header: sortableHeader(t('common.fields.title')), meta: { class: { td: 'max-sm:whitespace-normal' } } },
  { accessorKey: 'status', header: sortableHeader(t('catalog.fields.status')) },
  { accessorKey: 'project', header: sortableHeader(t('catalog.fields.project')) },
  { accessorKey: 'theme', header: sortableHeader(t('catalog.fields.theme')) },
  ...(props.admin
    ? [
        // The family axis, which the folder page draws as one card: the variant
        // label, its family on hover, or the deck this one is replaced by.
        {
          id: 'family',
          accessorFn: (item: PresentationListItem) => item.supersededBy ? `→ ${item.supersededBy}` : [item.family, item.variantLabel].filter(Boolean).join(' · '),
          header: sortableHeader(t('catalog.table.variantColumn')),
          cell: ({ row }: { row: { original: PresentationListItem } }) => {
            const { family, variantLabel, supersededBy } = row.original
            if (supersededBy)
              return h('span', { class: 'text-muted' }, t('catalog.table.replacedBy', { slug: supersededBy }))
            return family ? h('span', { title: family }, variantLabel ?? family) : ''
          },
        } satisfies TableColumn<PresentationListItem>,
        { accessorKey: 'filename', header: sortableHeader(t('catalog.table.fileColumn')) } satisfies TableColumn<PresentationListItem>,
      ]
    : []),
  {
    id: 'actions',
    header: '',
    // Pinned right: on horizontal overflow only the middle columns scroll under it.
    // Its opaque bg occludes them.
    meta: {
      class: {
        td: 'sticky right-0 w-0 bg-default',
        th: 'sticky right-0 bg-default',
      },
    },
  },
])

function rowActions(item: PresentationListItem) {
  const defaultTarget = defaultDeckTarget(item)
  return [
    [
      { label: t('catalog.table.open'), icon: 'i-lucide-arrow-up-right', to: defaultTarget },
      { label: t('catalog.table.openInNewTab'), icon: 'i-lucide-external-link', to: defaultTarget, target: '_blank' },
    ],
    [
      { label: t('catalog.table.copyLink'), icon: 'i-lucide-link', onSelect: () => copyLinks([item]) },
      ...downloadItems(item, !isFrozen(item)),
    ],
    ...(props.admin && !isFrozen(item)
      ? [
          [
            { label: t('common.actions.edit'), icon: 'i-lucide-pencil', to: `/edit/${item.slug}` },
            { label: t('catalog.deck.metadata'), icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta', item) },
            ...(item.canShare ? [{ label: t('catalog.deck.share'), icon: 'i-lucide-users', onSelect: () => emit('share', item) }] : []),
          ],
          [
            { label: t('catalog.deck.createVariant'), icon: 'i-lucide-languages', onSelect: () => emit('duplicate', item, 'variant') },
            { label: t('catalog.deck.newEdition'), icon: 'i-lucide-copy-plus', onSelect: () => emit('duplicate', item, 'edition') },
          ],
          [
            {
              label: t('catalog.deck.delete'),
              icon: 'i-lucide-trash-2',
              color: 'error' as const,
              onSelect: () => emit('remove', item),
            },
          ],
        ]
      : []),
  ]
}

const selectedItems = computed<PresentationListItem[]>(() =>
  (table.value?.tableApi?.getFilteredSelectedRowModel().rows ?? []).map(r => r.original))

const shownRange = computed(() => {
  const total = table.value?.tableApi?.getFilteredRowModel().rows.length ?? props.items.length
  const { pageIndex, pageSize } = pagination.value
  if (total === 0)
    return { from: 0, to: 0, total }
  return { from: pageIndex * pageSize + 1, to: Math.min((pageIndex + 1) * pageSize, total), total }
})

async function copyLinks(items: PresentationListItem[]) {
  const urls = items.map(i => new URL(deckPath(i), window.location.origin).href)
  await navigator.clipboard.writeText(urls.join('\n'))
  toast.add({
    title: t('catalog.table.linksCopied', urls.length),
    icon: 'i-lucide-clipboard-check',
    color: 'success',
  })
}

function csvEscape(value: string) {
  return /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function exportCsv(items: PresentationListItem[]) {
  const header = ['title', 'status', 'project', 'theme', 'url']
  const lines = items.map(i => [
    i.title,
    i.status,
    i.project ?? '',
    i.theme,
    new URL(deckPath(i), window.location.origin).href,
  ].map(csvEscape).join(','))
  saveTextFile('presentations.csv', [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8')
  toast.add({ title: t('catalog.table.exported', { n: items.length }), icon: 'i-lucide-file-down', color: 'success' })
}

function clearSelection() {
  rowSelection.value = {}
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UTable
      ref="table"
      v-model:sorting="sorting"
      v-model:row-selection="rowSelection"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      :ui="{ root: 'rounded-lg bg-default shadow-sm' }"
    >
      <!-- Taxonomies stripped to plain text (clean base): no colour, no icon. -->
      <template #title-cell="{ row }">
        <div class="flex items-center gap-2 min-w-48 max-sm:min-w-0">
          <span class="font-medium text-highlighted max-sm:line-clamp-2">{{ row.original.title }}</span>
          <span
            v-if="row.original.unlisted"
            class="text-xs text-muted"
          >{{ t('catalog.deck.unlisted') }}</span>
          <span
            v-if="admin && row.original.published === false"
            class="text-xs text-muted"
          >{{ t('catalog.deck.unpublished') }}</span>
        </div>
      </template>

      <template #status-cell="{ row }">
        <div class="flex items-center gap-2 text-sm">
          <span>{{ STATUS_CONFIG[row.original.status] ? t(STATUS_CONFIG[row.original.status].labelKey) : row.original.status }}</span>
          <span
            v-if="isFrozen(row.original)"
            class="text-muted"
          >{{ row.original.lifecycle === 'archived' ? t('catalog.deck.archived') : t('catalog.deck.frozen') }}</span>
          <span
            v-if="row.original.sharedCount"
            class="inline-flex items-center gap-0.5 text-xs text-muted"
            :title="t('catalog.deck.sharedAccess', row.original.sharedCount)"
          >
            <UIcon
              name="i-lucide-users"
              class="size-3"
            />
            {{ row.original.sharedCount }}
          </span>
        </div>
      </template>

      <template #project-cell="{ row }">
        <span
          v-if="row.original.project"
          class="text-sm"
        >{{ projectMeta.get(row.original.project)?.title ?? row.original.project }}</span>
        <span
          v-else
          class="text-dimmed"
        >{{ t('catalog.project.ungroupedTitle') }}</span>
      </template>

      <template #theme-cell="{ row }">
        <span class="text-sm">{{ row.original.theme }}</span>
      </template>

      <template #filename-cell="{ row }">
        <span class="font-mono text-xs text-muted">{{ row.original.filename }}</span>
      </template>

      <template #actions-cell="{ row }">
        <div
          class="flex justify-end items-center gap-0.5"
          @click.stop
        >
          <UTooltip :text="t('catalog.table.view')">
            <UButton
              :to="defaultDeckTarget(row.original)"
              icon="i-lucide-eye"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('catalog.table.viewItem', { title: row.original.title })"
            />
          </UTooltip>
          <!-- A frozen deck keeps the pencil's place, so the icons of every row line up. -->
          <UTooltip
            v-if="admin"
            :text="t('common.actions.edit')"
            :disabled="isFrozen(row.original)"
          >
            <UButton
              :to="`/edit/${row.original.slug}`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              :class="{ invisible: isFrozen(row.original) }"
              :aria-label="t('catalog.table.editItem', { title: row.original.title })"
            />
          </UTooltip>
          <UDropdownMenu
            :items="rowActions(row.original)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('catalog.deck.actionsLabel', { title: row.original.title })"
            />
          </UDropdownMenu>
        </div>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm text-muted">
        {{ t('catalog.table.range', shownRange) }}
      </span>
      <USelect
        :model-value="pagination.pageSize"
        :items="PAGE_SIZES.map(n => ({ label: t('catalog.table.pageSizeOption', { size: n }), value: n }))"
        size="sm"
        class="w-28"
        :aria-label="t('catalog.table.pageSizeLabel')"
        @update:model-value="setPageSize"
      />
      <div class="flex-1" />
      <UPagination
        :page="pagination.pageIndex + 1"
        :items-per-page="pagination.pageSize"
        :total="shownRange.total"
        @update:page="setPage"
      />
    </div>
  </div>

  <!-- Bulk actions float over the page (fixed) so appearing never shifts the table. -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-3"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 translate-y-3"
  >
    <div
      v-if="selectedItems.length > 0"
      class="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-max max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full bg-inverted text-inverted py-1.5 pl-4 pr-2 shadow-2xl"
    >
      <span class="text-sm font-semibold whitespace-nowrap">
        {{ t('catalog.table.selectedCount', selectedItems.length) }}
      </span>
      <span class="mx-2 h-5 w-px bg-inverted/15" />
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-default/10"
        @click="copyLinks(selectedItems)"
      >
        <UIcon
          name="i-lucide-link"
          class="size-4"
        />
        {{ t('catalog.table.copyLinks') }}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-default/10"
        @click="exportCsv(selectedItems)"
      >
        <UIcon
          name="i-lucide-file-down"
          class="size-4"
        />
        {{ t('catalog.table.exportCsv') }}
      </button>
      <span class="mx-1 h-5 w-px bg-inverted/15" />
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-default/10"
        :aria-label="t('catalog.table.clearSelection')"
        @click="clearSelection"
      >
        <UIcon
          name="i-lucide-x"
          class="size-4"
        />
      </button>
    </div>
  </Transition>
</template>
