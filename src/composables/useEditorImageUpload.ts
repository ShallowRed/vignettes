import type { Extension } from '@codemirror/state'
import type { Ref } from 'vue'
import { EditorView } from '@codemirror/view'
import { safeInsertPos } from '~/utils/editor-commands'

/**
 * Paste/drop image upload for the markdown editor: uploads to /api/media and
 * inserts an `::Image` directive at the caret (or the drop point). Self-contained
 * so the editor page's setup stays about the document, not file I/O. `writable`
 * gates it — a read-only editor ignores pasted/dropped files.
 */
export function useEditorImageUpload(writable: Ref<boolean>) {
  const toast = useToast()

  async function uploadImage(file: File): Promise<string> {
    const body = new FormData()
    body.append('file', file)
    const res = await $fetch<{ src: string }>('/api/media', { method: 'POST', body })
    return res.src
  }

  function insertUploadedImage(view: EditorView, at: number, src: string): void {
    const pos = safeInsertPos(view.state.doc, at)
    const line = view.state.doc.lineAt(pos)
    const lead = line.text.trim().length > 0 ? '\n\n' : ''
    const text = `${lead}::Image{src="${src}" alt=""}\n::\n`
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
    view.focus()
  }

  function imageFilesFrom(list: FileList | null | undefined): File[] {
    return [...(list ?? [])].filter(f => f.type.startsWith('image/'))
  }

  async function uploadAndInsert(view: EditorView, files: File[]): Promise<void> {
    for (const file of files) {
      try {
        const src = await uploadImage(file)
        insertUploadedImage(view, view.state.selection.main.head, src)
      }
      catch {
        toast.add({ title: 'Échec de l\'import de l\'image', icon: 'i-lucide-triangle-alert', color: 'error' })
      }
    }
  }

  const imageUploadHandlers: Extension = EditorView.domEventHandlers({
    paste(event, view) {
      if (!writable.value)
        return false
      const files = imageFilesFrom(event.clipboardData?.files)
      if (!files.length)
        return false
      event.preventDefault()
      uploadAndInsert(view, files)
      return true
    },
    drop(event, view) {
      if (!writable.value)
        return false
      const files = imageFilesFrom(event.dataTransfer?.files)
      if (!files.length)
        return false
      event.preventDefault()
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos != null)
        view.dispatch({ selection: { anchor: pos } })
      uploadAndInsert(view, files)
      return true
    },
  })

  return { imageUploadHandlers }
}
