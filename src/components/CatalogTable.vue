<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { TableColumn } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'
import { getPaginationRowModel, getSortedRowModel } from '@tanstack/vue-table'
import { h, resolveComponent } from 'vue'

// Table view of the catalog: column sorting, client pagination, row selection
// with bulk actions. Receives the already-filtered list (toolbar owns filtering).
const props = defineProps<{
  items: PresentationListItem[]
  admin?: boolean
  projects?: Project[]
}>()

const emit = defineEmits<{
  editMeta: [item: PresentationListItem]
  remove: [item: PresentationListItem]
}>()

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const toast = useToast()

const table = useTemplateRef('table')

const PAGE_SIZE_KEY = 'nuxt-slides:catalog-page-size'
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
    header: ({ table: t }) => h(UCheckbox, {
      'modelValue': t.getIsSomePageRowsSelected() ? 'indeterminate' : t.getIsAllPageRowsSelected(),
      'aria-label': 'Tout sélectionner',
      'onUpdate:modelValue': (v: boolean | 'indeterminate') => t.toggleAllPageRowsSelected(!!v),
    }),
    cell: ({ row }) => h('div', { onClick: stopRowClick, class: 'flex' }, [
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'aria-label': 'Sélectionner la ligne',
        'onUpdate:modelValue': (v: boolean | 'indeterminate') => row.toggleSelected(!!v),
      }),
    ]),
  },
  { accessorKey: 'title', header: sortableHeader('Titre') },
  { accessorKey: 'status', header: sortableHeader('Statut') },
  { accessorKey: 'project', header: sortableHeader('Projet') },
  { accessorKey: 'theme', header: sortableHeader('Thème') },
  ...(props.admin
    ? [{ accessorKey: 'filename', header: sortableHeader('Fichier') } satisfies TableColumn<PresentationListItem>]
    : []),
  { id: 'actions', header: '' },
])

function rowActions(item: PresentationListItem) {
  return [
    [
      { label: 'Ouvrir', icon: 'i-lucide-arrow-up-right', to: deckPath(item) },
      { label: 'Ouvrir dans un nouvel onglet', icon: 'i-lucide-external-link', to: deckPath(item), target: '_blank' },
    ],
    [
      { label: 'Copier le lien', icon: 'i-lucide-link', onSelect: () => copyLinks([item]) },
    ],
    ...(props.admin && !isFrozen(item)
      ? [
          [
            { label: 'Éditer le contenu', icon: 'i-lucide-pencil', to: `/edit/${item.slug}` },
            { label: 'Métadonnées…', icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta', item) },
          ],
          [
            {
              label: item.fileBacked ? 'Réinitialiser depuis le fichier…' : 'Supprimer…',
              icon: 'i-lucide-trash-2',
              color: 'error' as const,
              onSelect: () => emit('remove', item),
            },
          ],
        ]
      : []),
  ]
}

function onRowClick(_e: Event, row: { original: PresentationListItem }) {
  navigateTo(deckPath(row.original))
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
    title: urls.length === 1 ? 'Lien copié' : `${urls.length} liens copiés`,
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
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'presentations.csv'
  a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: `${items.length} présentation(s) exportée(s)`, icon: 'i-lucide-file-down', color: 'success' })
}

function clearSelection() {
  rowSelection.value = {}
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="selectedItems.length > 0"
      class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated px-4 py-2.5 ring ring-accented"
    >
      <span class="text-sm font-medium text-highlighted">
        {{ selectedItems.length }} sélectionnée(s)
      </span>
      <div class="flex-1" />
      <UButton
        icon="i-lucide-link"
        label="Copier les liens"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="copyLinks(selectedItems)"
      />
      <UButton
        icon="i-lucide-file-down"
        label="Exporter CSV"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="exportCsv(selectedItems)"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Effacer la sélection"
        @click="clearSelection"
      />
    </div>

    <UTable
      ref="table"
      v-model:sorting="sorting"
      v-model:row-selection="rowSelection"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :sorting-options="{ getSortedRowModel: getSortedRowModel() }"
      :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      :ui="{ root: 'rounded-lg ring ring-default', tr: 'cursor-pointer' }"
      @select="onRowClick"
    >
      <template #title-cell="{ row }">
        <div class="flex items-center gap-2 min-w-48">
          <span class="font-medium text-highlighted">{{ row.original.title }}</span>
          <UBadge
            v-if="row.original.unlisted"
            color="neutral"
            variant="subtle"
            size="sm"
            icon="i-lucide-eye-off"
            aria-label="Unlisted"
          />
          <UTooltip
            v-if="admin && row.original.published === false && !row.original.fileBacked"
            text="Aucune version publiée : le deck n'est pas encore servable"
          >
            <UBadge
              color="warning"
              variant="subtle"
              size="sm"
              icon="i-lucide-cloud-off"
              aria-label="Non publié"
            />
          </UTooltip>
        </div>
      </template>

      <template #status-cell="{ row }">
        <div class="flex items-center gap-1.5">
          <UBadge
            :color="STATUS_CONFIG[row.original.status]?.color || 'neutral'"
            variant="subtle"
            size="sm"
            :icon="STATUS_CONFIG[row.original.status]?.icon"
            :label="STATUS_CONFIG[row.original.status]?.label || row.original.status"
          />
          <UTooltip
            v-if="isFrozen(row.original)"
            text="Instantané autoportant : contenu figé"
          >
            <UBadge
              color="info"
              variant="subtle"
              size="sm"
              icon="i-lucide-snowflake"
              :label="row.original.lifecycle === 'archived' ? 'Archivée' : 'Gelée'"
            />
          </UTooltip>
        </div>
      </template>

      <template #project-cell="{ row }">
        <div
          v-if="row.original.project"
          class="flex items-center gap-1.5 text-sm"
        >
          <span
            v-if="projectMeta.get(row.original.project)?.color"
            class="size-2 rounded-full shrink-0"
            :style="{ backgroundColor: projectMeta.get(row.original.project)?.color }"
          />
          {{ projectMeta.get(row.original.project)?.title ?? row.original.project }}
        </div>
        <span
          v-else
          class="text-dimmed"
        >—</span>
      </template>

      <template #theme-cell="{ row }">
        <UBadge
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-palette"
          :label="row.original.theme"
        />
      </template>

      <template #filename-cell="{ row }">
        <span class="font-mono text-xs text-muted">{{ row.original.filename }}</span>
      </template>

      <template #actions-cell="{ row }">
        <div
          class="flex justify-end"
          @click.stop
        >
          <UDropdownMenu
            :items="rowActions(row.original)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Actions"
            />
          </UDropdownMenu>
        </div>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm text-muted">
        {{ shownRange.from }}–{{ shownRange.to }} sur {{ shownRange.total }}
      </span>
      <USelect
        :model-value="pagination.pageSize"
        :items="PAGE_SIZES.map(n => ({ label: `${n} / page`, value: n }))"
        size="sm"
        class="w-28"
        aria-label="Éléments par page"
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
</template>
