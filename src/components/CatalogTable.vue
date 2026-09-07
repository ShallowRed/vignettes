<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { TableColumn } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'
import { getPaginationRowModel, getSortedRowModel } from '@tanstack/vue-table'
import { h, resolveComponent } from 'vue'
import { useAppSession } from '~/composables/useAppSession'

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
  remove: [item: PresentationListItem]
}>()
// Sharing is owner-only server-side, so the entry only shows for an owner.
const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')

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
      { label: 'Ouvrir', icon: 'i-lucide-arrow-up-right', to: defaultTarget },
      { label: 'Ouvrir dans un nouvel onglet', icon: 'i-lucide-external-link', to: defaultTarget, target: '_blank' },
    ],
    [
      { label: 'Copier le lien', icon: 'i-lucide-link', onSelect: () => copyLinks([item]) },
    ],
    ...(props.admin && !isFrozen(item)
      ? [
          [
            { label: 'Éditer le contenu', icon: 'i-lucide-pencil', to: `/edit/${item.slug}` },
            { label: 'Métadonnées…', icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta', item) },
            ...(isOwner.value ? [{ label: 'Partager…', icon: 'i-lucide-users', onSelect: () => emit('share', item) }] : []),
          ],
          [
            {
              label: 'Supprimer…',
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
    <UTable
      ref="table"
      v-model:sorting="sorting"
      v-model:row-selection="rowSelection"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :sorting-options="{ getSortedRowModel: getSortedRowModel() }"
      :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      :ui="{ root: 'rounded-lg bg-default shadow-sm' }"
    >
      <!-- Taxonomies stripped to plain text (clean base): no colour, no icon. -->
      <template #title-cell="{ row }">
        <div class="flex items-center gap-2 min-w-48">
          <span class="font-medium text-highlighted">{{ row.original.title }}</span>
          <span
            v-if="row.original.unlisted"
            class="text-xs text-muted"
          >Non répertoriée</span>
          <span
            v-if="admin && row.original.published === false"
            class="text-xs text-muted"
          >Non publié</span>
        </div>
      </template>

      <template #status-cell="{ row }">
        <div class="flex items-center gap-2 text-sm">
          <span>{{ STATUS_CONFIG[row.original.status]?.label || row.original.status }}</span>
          <span
            v-if="isFrozen(row.original)"
            class="text-muted"
          >{{ row.original.lifecycle === 'archived' ? 'Archivée' : 'Gelée' }}</span>
          <span
            v-if="row.original.sharedCount"
            class="inline-flex items-center gap-0.5 text-xs text-muted"
            :title="`${row.original.sharedCount} accès partagé${row.original.sharedCount > 1 ? 's' : ''}`"
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
        >Divers</span>
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
          <UTooltip text="Consulter">
            <UButton
              :to="defaultDeckTarget(row.original)"
              icon="i-lucide-eye"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Consulter"
            />
          </UTooltip>
          <UTooltip
            v-if="admin && !isFrozen(row.original)"
            text="Éditer le contenu"
          >
            <UButton
              :to="`/edit/${row.original.slug}`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Éditer"
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
              aria-label="Autres actions"
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
        {{ selectedItems.length }} sélectionnée{{ selectedItems.length > 1 ? 's' : '' }}
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
        Copier les liens
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
        Exporter CSV
      </button>
      <span class="mx-1 h-5 w-px bg-inverted/15" />
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-default/10"
        aria-label="Effacer la sélection"
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
