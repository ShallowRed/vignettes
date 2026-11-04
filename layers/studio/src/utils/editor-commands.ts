import type { EditorState, Text, TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { snippet } from '@codemirror/autocomplete'
import { blockEndAround } from '@vignettes/core/deck'

/**
 * Markdown insertion helpers for the writer toolbar. Each command edits the
 * document through the view's dispatch (single undoable transaction) and gives
 * focus back to the editor. A read-only editor ignores them, as the commands of
 * `@codemirror/commands` do: the shared draft is read-only until it arrives.
 */

/** Wrap the selection in `marker` (bold, italic, code…); no selection inserts a selected placeholder. */
export function wrapSelection(view: EditorView, marker: string, placeholder: string): void {
  if (view.state.readOnly)
    return
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to) || placeholder
  view.dispatch({
    changes: { from, to, insert: `${marker}${selected}${marker}` },
    selection: { anchor: from + marker.length, head: from + marker.length + selected.length },
  })
  view.focus()
}

/** Set the current line to heading `level`; the same level again removes it. */
export function setHeading(view: EditorView, level: number): void {
  if (view.state.readOnly)
    return
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const stripped = line.text.replace(/^#{1,6} /, '')
  const current = (line.text.length - stripped.length - 1)
  const next = current === level ? stripped : `${'#'.repeat(level)} ${stripped}`
  view.dispatch({ changes: { from: line.from, to: line.to, insert: next } })
  view.focus()
}

/** Toggle a line prefix (`- `, `1. `, `> `) on the current line. */
export function toggleLinePrefix(view: EditorView, prefix: string): void {
  if (view.state.readOnly)
    return
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  view.dispatch(line.text.startsWith(prefix)
    ? { changes: { from: line.from, to: line.from + prefix.length, insert: '' } }
    : { changes: { from: line.from, insert: prefix } })
  view.focus()
}

// The address of a link or an image starts with the scheme a deck takes; the
// caret goes after it.
const URL_START = 'https://'

/** Turn the selection into a link, the caret in its address; no selection inserts `placeholder` as its text. */
export function insertLink(view: EditorView, placeholder: string): void {
  if (view.state.readOnly)
    return
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to) || placeholder
  const insert = `[${text}](${URL_START})`
  const urlStart = from + text.length + 3
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart + URL_START.length },
  })
  view.focus()
}

/**
 * Insert a snippet template (tabbable `${…}` placeholders) at the cursor.
 * A multi-line block dropped mid-line gets its own paragraph first.
 */
export function insertSnippet(view: EditorView, template: string): void {
  if (view.state.readOnly)
    return
  const { from, to } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const needsBreak = template.includes('\n') && line.text.trim().length > 0
  snippet(needsBreak ? `\n${template}` : template)(view, null, from, to)
  view.focus()
}

/**
 * Clamp `pos` to never land inside the YAML frontmatter — a block dropped
 * between the `---` fences would corrupt the deck. Returns `pos` unchanged when
 * it already sits past the frontmatter (or when there is none).
 */
export function safeInsertPos(doc: Text, pos: number): number {
  if (doc.line(1).text.trim() !== '---')
    return pos
  for (let i = 2; i <= doc.lines; i++) {
    if (doc.line(i).text.trim() === '---')
      return Math.max(pos, doc.line(i).to)
  }
  return pos
}

/** An `::Image` directive for an uploaded image at `at`, on its own paragraph, the caret after it. */
export function imageDirectiveInsertion(state: EditorState, at: number, src: string): TransactionSpec {
  const pos = safeInsertPos(state.doc, at)
  const lead = state.doc.lineAt(pos).text.trim().length > 0 ? '\n\n' : ''
  const insert = `${lead}::Image{src="${src}" alt=""}\n::\n`
  return { changes: { from: pos, insert }, selection: { anchor: pos + insert.length } }
}

/**
 * The end of the line after which a new slide goes: the caret's line, or the
 * line that closes the block around it, so the slide stays out of that block.
 */
function slideInsertPos(state: EditorState): number {
  const { doc } = state
  const line = doc.lineAt(state.selection.main.head)
  const end = blockEndAround(doc.toString(), line.number)
  return safeInsertPos(doc, end ? doc.line(end).to : line.to)
}

/**
 * A slide template fitted to the parser of the deck: split by headings, the
 * heading opens the slide and the leading `---` would add an empty one; split
 * by `---`, a content slide takes `###`, since a short `##` slide is a section.
 */
export function slideTemplateFor(template: string, parser: 'heading' | 'separator', section = false): string {
  if (parser === 'heading')
    return template.replace(/^---\n\n(?=#)/, '')
  return section ? template : template.replace(/^---\n\n## /, '---\n\n### ')
}

/** Insert a whole-slide template on its own paragraph after the current line, out of any block. */
export function insertSlideTemplate(view: EditorView, template: string): void {
  if (view.state.readOnly)
    return
  const pos = slideInsertPos(view.state)
  snippet(`\n\n${template}`)(view, null, pos, pos)
  view.focus()
}

/** Insert a Markdown image, the caret in its address; no selection inserts `placeholder` as its alternative text. */
export function insertImage(view: EditorView, placeholder: string): void {
  if (view.state.readOnly)
    return
  const { from, to } = view.state.selection.main
  const alt = view.state.sliceDoc(from, to) || placeholder
  const insert = `![${alt}](${URL_START})`
  const urlStart = from + alt.length + 4
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart + URL_START.length },
  })
  view.focus()
}

/** Start a new slide: a `---` separator on its own paragraph after the current line, out of any block. */
export function insertSlideBreak(view: EditorView): void {
  if (view.state.readOnly)
    return
  const pos = slideInsertPos(view.state)
  const insert = '\n\n---\n\n'
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  })
  view.focus()
}
