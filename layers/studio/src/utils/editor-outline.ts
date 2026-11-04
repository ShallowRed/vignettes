import type { TransactionSpec } from '@codemirror/state'
import type { Toast } from '@nuxt/ui/composables/useToast'
import type { TextChange } from '@vignettes/core/deck'
import { watch } from 'vue'

/** The only data a stack dragged in the outline carries, so that a drop on the source writes nothing there. */
export const OUTLINE_DRAG_TYPE = 'application/x-vignettes-outline-stack'

/**
 * The transaction of changes of the outline, which puts the caret at `anchor`
 * when given; without it, the caret follows the changes.
 */
export function outlineTransaction(edit: { changes: TextChange[], anchor?: number }): TransactionSpec {
  return {
    changes: edit.changes,
    ...(edit.anchor === undefined ? {} : { selection: { anchor: edit.anchor }, scrollIntoView: true }),
    userEvent: 'input.outline',
  }
}

/**
 * The place a stack dragged from `from` takes once dropped before or after
 * the stack at `h`: `from` when it stays where it is.
 */
export function dropPlace(from: number, target: { h: number, after: boolean }): number {
  if (target.after)
    return target.h >= from ? target.h : target.h + 1
  return target.h > from ? target.h - 1 : target.h
}

/** The toasts a notice is added to and removed from: those of `useToast`. */
interface NoticeToasts {
  add: (toast: Partial<Toast>) => { id: string | number }
  remove: (id: string | number) => void
}

/**
 * The notices that offer to undo a change of this tab, until its next change
 * (`localChanges` counts them). One notice is open at a time: a new notice
 * closes the previous one, whose button would undo another change.
 */
export function undoNotices(toasts: NoticeToasts, localChanges: () => number) {
  let open: { id: string | number, stop: () => void } | undefined

  function close() {
    const notice = open
    open = undefined
    notice?.stop()
    if (notice)
      toasts.remove(notice.id)
  }

  /** Opens `toast` once the change it offers to undo is made. */
  function show(toast: Partial<Toast>) {
    close()
    const mark = localChanges()
    const notice = { id: '' as string | number, stop: () => {} }
    notice.id = toasts.add({
      ...toast,
      'onUpdate:open': (isOpen: boolean) => {
        if (!isOpen && open === notice)
          close()
      },
    }).id
    notice.stop = watch(localChanges, (count) => {
      if (count !== mark && open === notice)
        close()
    })
    open = notice
  }

  return { show, close }
}
