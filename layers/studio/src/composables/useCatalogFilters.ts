import type { CatalogQuery, PresentationListItem } from '#shared/presentations'
import type { MaybeRefOrGetter } from 'vue'
import { applyCatalogQuery } from '#shared/presentations'

/**
 * Management-console filter state (search / status / project / sort) over a deck
 * listing. Pure view-model wiring on top of the framework-free `applyCatalogQuery`
 * — kept out of the page so the console's state is testable and reusable.
 */
export function useCatalogFilters(items: MaybeRefOrGetter<PresentationListItem[]>) {
  const query = ref<CatalogQuery>({ search: '', statuses: [], projects: [], sortKey: 'title', sortDir: 'asc' })

  const visible = computed(() => applyCatalogQuery(toValue(items), query.value))

  const hasActiveFilters = computed(() =>
    Boolean(query.value.search)
    || (query.value.statuses?.length ?? 0) > 0
    || (query.value.projects?.length ?? 0) > 0)

  function resetFilters() {
    query.value = { ...query.value, search: '', statuses: [], projects: [] }
  }

  return { query, visible, hasActiveFilters, resetFilters }
}
