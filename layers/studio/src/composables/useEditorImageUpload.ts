import type { StudioEventData } from '#shared/telemetry/events'
import type { Extension } from '@codemirror/state'
import type { Ref } from 'vue'
import { EditorView } from '@codemirror/view'
import { imageDirectiveInsertion } from '../utils/editor-commands'
import { imageUploadFailure } from '../utils/image-upload-failure'

/**
 * Image upload for the markdown editor: uploads to /api/media and inserts an
 * `::Image` directive at the caret (or the drop point). Paste, drop and the
 * toolbar's file chooser all go through `uploadImages`. Self-contained so the
 * editor page's setup stays about the document, not file I/O. `writable`
 * gates paste and drop: a read-only editor ignores pasted or dropped files.
 */
export function useEditorImageUpload(writable: Ref<boolean>, slug: string) {
  const toast = useToast()
  const { track } = useStudioEvent()
  const { t, locale } = useI18n()

  async function uploadImage(file: File): Promise<string> {
    const body = new FormData()
    body.append('file', file)
    // The server checks the upload against the actor's rights on this deck.
    const res = await $fetch<{ src: string }>('/api/media', { method: 'POST', body, query: { deck: slug } })
    return res.src
  }

  function imageFilesFrom(list: FileList | null | undefined): File[] {
    return [...(list ?? [])].filter(f => f.type.startsWith('image/'))
  }

  /** `via` names the gesture that brings the files. */
  async function uploadImages(view: EditorView, files: File[], via: Extract<StudioEventData<'editor-inserted'>, { kind: 'image' }>['via']): Promise<void> {
    let inserted = false
    for (const file of files) {
      try {
        const src = await uploadImage(file)
        if (view.state.readOnly) {
          toast.add({ title: t('editor.imageUpload.notInserted', { name: file.name }), icon: 'i-lucide-triangle-alert', color: 'error' })
          continue
        }
        view.dispatch(imageDirectiveInsertion(view.state, view.state.selection.main.head, src))
        view.focus()
        inserted = true
      }
      catch (error) {
        toast.add({ ...imageUploadFailure(error, file, t, locale.value), icon: 'i-lucide-triangle-alert', color: 'error' })
      }
    }
    if (inserted)
      track('editor-inserted', { kind: 'image', source: 'file', via })
  }

  const imageUploadHandlers: Extension = EditorView.domEventHandlers({
    paste(event, view) {
      if (!writable.value)
        return false
      const files = imageFilesFrom(event.clipboardData?.files)
      if (!files.length)
        return false
      event.preventDefault()
      uploadImages(view, files, 'paste')
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
      uploadImages(view, files, 'drop')
      return true
    },
  })

  return { imageUploadHandlers, uploadImages }
}
