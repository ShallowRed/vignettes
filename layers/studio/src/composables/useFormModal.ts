import type { Ref } from 'vue'

/**
 * Shared modal-form plumbing: reactive state reset to `initial()` every time the
 * modal opens, an error-message slot, and a submit gate. Components keep their
 * own mutation, validation and any extra fields — this only removes the repeated
 * open-watch and the "bail if invalid, clear error, run" dance.
 *
 * `initial` is called on each open, so a modal that edits an entity can read the
 * current props there. `onReset` runs after the reset for any extra per-open
 * bookkeeping (e.g. a "slug edited by hand" flag).
 */
export function useFormModal<T extends object>(open: Ref<boolean>, initial: () => T, onReset?: () => void) {
  const state = reactive(initial()) as T
  const errorMessage = ref('')

  watch(open, (now) => {
    if (now) {
      Object.assign(state, initial())
      errorMessage.value = ''
      onReset?.()
    }
  })

  /** Clear the error, then run `action` when `valid`. */
  function runIfValid(valid: boolean, action: () => void) {
    if (!valid)
      return
    errorMessage.value = ''
    action()
  }

  return { state, errorMessage, runIfValid }
}
