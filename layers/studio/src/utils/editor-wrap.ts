import type { Extension, Range } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'

/**
 * Line wrapping where a wrapped line continues under its own text: the screen
 * lines after the first keep the line's indentation plus two characters, so the
 * nesting of components stays readable. `editorTheme` reads `--hanging-indent`.
 */
function hangingIndent(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos)
      const indent = line.text.length - line.text.trimStart().length + 2
      marks.push(Decoration.line({ attributes: { style: `--hanging-indent: ${indent}ch` } }).range(line.from))
      pos = line.to + 1
    }
  }
  return Decoration.set(marks)
}

export function wrappedLines(): Extension {
  return [
    EditorView.lineWrapping,
    ViewPlugin.fromClass(class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = hangingIndent(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged)
          this.decorations = hangingIndent(update.view)
      }
    }, { decorations: plugin => plugin.decorations }),
  ]
}
