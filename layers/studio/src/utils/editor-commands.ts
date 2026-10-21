import type { EditorState, Text, TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { snippet } from '@codemirror/autocomplete'

/**
 * Markdown insertion helpers for the writer toolbar. Each command edits the
 * document through the view's dispatch (single undoable transaction) and gives
 * focus back to the editor.
 */

/** Wrap the selection in `marker` (bold, italic, code…); no selection inserts a selected placeholder. */
export function wrapSelection(view: EditorView, marker: string, placeholder: string): void {
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
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const stripped = line.text.replace(/^#{1,6} /, '')
  const current = (line.text.length - stripped.length - 1)
  const next = current === level ? stripped : `${'#'.repeat(level)} ${stripped}`
  view.dispatch({ changes: { from: line.from, to: line.to, insert: next } })
  view.focus()
}

/** Toggle a line prefix (`- `, `1. `, `> `) on the current line. */
export function toggleLinePrefix(view: EditorView, prefix: string): void {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  view.dispatch(line.text.startsWith(prefix)
    ? { changes: { from: line.from, to: line.from + prefix.length, insert: '' } }
    : { changes: { from: line.from, insert: prefix } })
  view.focus()
}

/** Turn the selection into a link, leaving the url placeholder selected; no selection inserts `placeholder` as its text. */
export function insertLink(view: EditorView, placeholder: string): void {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to) || placeholder
  const insert = `[${text}](url)`
  const urlStart = from + text.length + 3
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  })
  view.focus()
}

/**
 * Insert a snippet template (tabbable `${…}` placeholders) at the cursor.
 * A multi-line block dropped mid-line gets its own paragraph first.
 */
export function insertSnippet(view: EditorView, template: string): void {
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

/** Insert a whole-slide template on its own paragraph after the current line. */
export function insertSlideTemplate(view: EditorView, template: string): void {
  const { doc } = view.state
  const pos = safeInsertPos(doc, doc.lineAt(view.state.selection.main.head).to)
  snippet(`\n\n${template}`)(view, null, pos, pos)
  view.focus()
}

/** Insert an image directive, url placeholder selected; no selection inserts `placeholder` as its alternative text. */
export function insertImage(view: EditorView, placeholder: string): void {
  const { from, to } = view.state.selection.main
  const alt = view.state.sliceDoc(from, to) || placeholder
  const insert = `![${alt}](url)`
  const urlStart = from + alt.length + 4
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  })
  view.focus()
}

/** Start a new slide: a `---` separator on its own paragraph after the current line. */
export function insertSlideBreak(view: EditorView): void {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const insert = '\n\n---\n\n'
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  })
  view.focus()
}
