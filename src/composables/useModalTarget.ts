import type { Ref } from 'vue'

/**
 * The per-item management modals shared by the catalog pages: one selected
 * target plus an open flag per action. Opening an action selects its item, so
 * the home grid and a folder page drive the same DeckMeta/DeckDelete modals
 * without repeating the wiring.
 */
export function useModalTarget<T>() {
  const target = ref<T | null>(null) as Ref<T | null>
  const metaOpen = ref(false)
  const deleteOpen = ref(false)
  // Which part of the metadata panel to bring into view: sharing is reachable
  // straight from a card, so it must not open on the top of a long panel.
  const metaFocus = ref<'sharing' | undefined>()

  function openMeta(item: T, focus?: 'sharing') {
    target.value = item
    metaFocus.value = focus
    metaOpen.value = true
  }
  function openDelete(item: T) {
    target.value = item
    deleteOpen.value = true
  }

  return { target, metaOpen, metaFocus, deleteOpen, openMeta, openDelete }
}
