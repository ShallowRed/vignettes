import type { ParserId, TextBlock } from '@vignettes/core/deck'
import type { SourceRange } from '@vignettes/core/render'
import type { Ref, ShallowRef } from 'vue'
import type { EditorHistory } from './useEditorHistory'
import type { PreviewInstance } from './useEditorPreview'
import { EditorView } from '@codemirror/view'
import { typedTextChange } from '@vignettes/core/deck'
import { readSourceRange, SOURCE_ATTRIBUTE, SOURCE_TEXT_ATTRIBUTE, TASK_BOX_TAG, TEXT_END_TAGS } from '@vignettes/core/render'
import { transformerTexte } from '@vignettes/typographie'
import { deckRange, followRange, textBlock } from '../utils/preview-source'

interface PreviewSourceOptions {
  previewFrame: Readonly<ShallowRef<HTMLElement | null>>
  previewInstance: Readonly<ShallowRef<PreviewInstance | null>>
  editorView: Readonly<Ref<EditorView | undefined>>
  /** The text the preview draws, and the parser that cut its slides. */
  renderedText: Readonly<Ref<string>>
  parserId: Readonly<Ref<ParserId>>
  /** Whether the person may change the text. */
  writable: Readonly<Ref<boolean>>
  /** Keeps the preview as it is until the returned function runs. */
  holdPreview: () => () => void
  /** The parses of the preview that ended. */
  parseRun: Readonly<Ref<number>>
  /** The undo history of the mode, which writes an edit as one step. */
  history: EditorHistory
}

// The elements of a slide that answer a click themselves, and the field of an edit.
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, iframe, video, audio, [data-preview-image], [data-preview-link], .slide-text-field'

/** An edit of a text on the slide: the field typed in, the nodes it stands for, and the source it rewrites. */
interface Edit {
  view: EditorView
  element: HTMLElement
  field: HTMLElement
  nodes: ChildNode[]
  /** The blanks before the text, which the field leaves in place. */
  lead: Text
  /** The range of the text in the document, moved by every change of the document. */
  range: SourceRange
  written: string
  block: TextBlock
  release: () => void
}

/** The children of an element that its text stands for: after the box of a task, before the first block. */
function inlineNodes(element: HTMLElement): ChildNode[] {
  let nodes: ChildNode[] = []
  for (const node of element.childNodes) {
    const tag = node instanceof HTMLElement ? node.tagName.toLowerCase() : undefined
    if (tag && TEXT_END_TAGS.has(tag))
      break
    nodes = tag === TASK_BOX_TAG ? [] : [...nodes, node]
  }
  return nodes
}

/** The offset of the point clicked in the text of `nodes`, when the browser gives it. */
function clickedOffset(event: MouseEvent, nodes: ChildNode[]): number | undefined {
  const point = document.caretPositionFromPoint?.(event.clientX, event.clientY)
  // Safari gives the point as a range.
  const range = point ? null : document.caretRangeFromPoint?.(event.clientX, event.clientY)
  const target = point ? { node: point.offsetNode, offset: point.offset } : range ? { node: range.startContainer, offset: range.startOffset } : undefined
  if (!target)
    return undefined
  let offset = 0
  for (const node of nodes) {
    if (node === target.node || node.contains(target.node)) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      for (let text = node.nodeType === Node.TEXT_NODE ? node : walker.nextNode(); text; text = walker.nextNode()) {
        if (text === target.node)
          return offset + target.offset
        offset += text.textContent?.length ?? 0
      }
      return undefined
    }
    offset += node.textContent?.length ?? 0
  }
  return undefined
}

/**
 * The link from the preview to the source, through the source ranges the
 * parser writes on the elements of a slide (`SOURCE_ATTRIBUTE`). A click on an
 * element of the slide on screen selects the text it comes from in the
 * editor. A double-click on a heading, a paragraph or a list item edits its
 * text on the slide: the field shows the source of the text, Enter writes it
 * into the document in one change, Escape leaves it as it was.
 */
export function usePreviewSource(options: PreviewSourceOptions) {
  const { previewFrame, previewInstance, editorView, renderedText, parserId, writable } = options
  const { refused } = useRefusedText()

  let edit: Edit | null = null
  // A field written into the document, shown until the preview draws the new text.
  let written: Pick<Edit, 'field' | 'nodes' | 'lead'> | null = null

  /** The element under `target` that carries `attribute`, in the slide on screen, with the indices of that slide. */
  function sourceElement(target: EventTarget | null, attribute: string) {
    const reveal = previewInstance.value?.getInstance()
    const slide = reveal?.getCurrentSlide()
    if (!reveal || !slide || !(target instanceof Element) || !slide.contains(target) || target.closest(INTERACTIVE))
      return undefined
    const element = target.closest<HTMLElement>(`[${attribute}]`)
    if (!element || !slide.contains(element))
      return undefined
    const { h, v } = reveal.getIndices()
    return { element, slide: { h, v: v ?? 0 } }
  }

  /** Selects the text of a heading, a paragraph or a list item, otherwise the whole source of the element clicked. */
  function onPreviewClick(event: MouseEvent) {
    const view = editorView.value
    const found = !edit && sourceElement(event.target, SOURCE_ATTRIBUTE)
    if (!view || !found)
      return
    const range = readSourceRange(found.element.getAttribute(SOURCE_TEXT_ATTRIBUTE)) ?? readSourceRange(found.element.getAttribute(SOURCE_ATTRIBUTE))
    const placed = range && deckRange(renderedText.value, view.state.doc.toString(), parserId.value, found.slide, range)
    if (!placed)
      return
    // The preview stays on its slide and its step: `select.preview` tells the caret listener so.
    view.dispatch({
      selection: { anchor: placed.from, head: placed.to },
      effects: EditorView.scrollIntoView(placed.from, { y: 'center' }),
      userEvent: 'select.preview',
    })
  }

  /** Opens the edit of the text double-clicked, while no other edit is open or waits for the preview. */
  function onPreviewDoubleClick(event: MouseEvent) {
    const view = editorView.value
    const found = !edit && !written && writable.value && sourceElement(event.target, SOURCE_TEXT_ATTRIBUTE)
    if (!view || !found)
      return
    const doc = view.state.doc.toString()
    const place = (attribute: string) => {
      const range = readSourceRange(found.element.getAttribute(attribute))
      return range && deckRange(renderedText.value, doc, parserId.value, found.slide, range)
    }
    const range = place(SOURCE_TEXT_ATTRIBUTE)
    const whole = place(SOURCE_ATTRIBUTE)
    if (!range || !whole)
      return
    event.preventDefault()
    open(view, found.element, range, doc.slice(range.from, range.to), textBlock(found.element.tagName, doc.slice(whole.from, whole.to)), event)
  }

  function open(view: EditorView, element: HTMLElement, range: SourceRange, source: string, block: TextBlock, event: MouseEvent) {
    const release = options.holdPreview()
    const nodes = inlineNodes(element)
    const shown = nodes.map(node => node.textContent ?? '').join('')
    const offset = clickedOffset(event, nodes)

    const field = document.createElement('span')
    field.className = 'slide-text-field'
    field.contentEditable = 'plaintext-only'
    // Reveal leaves a swipe that starts here to the field.
    field.dataset.preventSwipe = ''
    field.textContent = source
    // The blank between the box of a task and its text stays before the field.
    const lead = document.createTextNode(/^\s*/.exec(shown)![0])
    element.insertBefore(lead, nodes[0] ?? null)
    element.insertBefore(field, nodes[0] ?? null)
    for (const node of nodes)
      node.remove()

    edit = { view, element, field, nodes, lead, range, written: source, block, release }
    field.addEventListener('keydown', onKeydown)
    field.addEventListener('blur', onBlur)
    field.focus()

    // The caret goes where the click fell when the slide shows the source as
    // it is written, French typography or not, character for character.
    const text = shown.slice(lead.length)
    const plain = text.length === source.length && (text === source || text === transformerTexte(source))
    const selection = window.getSelection()
    if (selection && field.firstChild) {
      const at = plain && offset !== undefined ? Math.max(0, Math.min(offset - lead.length, source.length)) : source.length
      selection.collapse(field.firstChild, at)
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      finish(true)
      previewFrame.value?.focus()
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(false)
      previewFrame.value?.focus()
    }
  }

  // A blur from leaving the window keeps the edit, which the field holds again on return.
  function onBlur() {
    if (document.hasFocus())
      finish(true)
  }

  function close(current: Edit) {
    current.field.removeEventListener('keydown', onKeydown)
    current.field.removeEventListener('blur', onBlur)
    current.field.removeAttribute('contenteditable')
    edit = null
  }

  /** Ends the edit: writes the text typed when `write` holds, and lets the preview parse again. */
  function finish(write: boolean) {
    const current = edit
    if (!current)
      return
    // The browser may write a line break of the field as a `<br>`, which `innerText` reads.
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    const typed = current.field.innerText
    close(current)
    const change = write ? typedTextChange(current.view.state.doc.toString(), current.range, current.written, typed, current.block, parserId.value) : undefined
    if (typeof change !== 'object') {
      restore(current)
      current.release()
      if (change)
        refused(change, typed)
      return
    }
    options.history.write(current.view, { changes: change, userEvent: 'input.preview' })
    current.field.textContent = change.insert
    written = { field: current.field, nodes: current.nodes, lead: current.lead }
    current.release()
  }

  /** Puts back the nodes the field stands for, in its place. */
  function restore(shown: Pick<Edit, 'field' | 'nodes' | 'lead'>) {
    shown.lead.remove()
    shown.field.replaceWith(...shown.nodes)
  }

  // The nodes of a written field come back before Vue updates the preview,
  // which then finds the elements it drew, even when it gives the section to
  // another slide of the same text or when the parse fails.
  watch(options.parseRun, () => {
    if (!written)
      return
    restore(written)
    written = null
  }, { flush: 'pre' })

  /** Moves the range of the text under edit with every change of the document. */
  const sourceTracking = EditorView.updateListener.of((update) => {
    if (edit && update.docChanged)
      edit.range = followRange(edit.range, update.changes)
  })

  onBeforeUnmount(() => {
    if (edit) {
      const current = edit
      close(current)
      restore(current)
      current.release()
    }
  })

  return { onPreviewClick, onPreviewDoubleClick, sourceTracking }
}
