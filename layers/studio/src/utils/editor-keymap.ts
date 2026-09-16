import type { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'
import { addCursorAbove, addCursorBelow, indentWithTab, insertBlankLine, selectLine } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap, selectNextOccurrence, selectSelectionMatches } from '@codemirror/search'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { crosshairCursor, drawSelection, keymap, rectangularSelection } from '@codemirror/view'

/**
 * The editing shortcuts a VS Code user expects, on top of CodeMirror's default
 * keymap (move and copy lines with Alt, delete a line with Mod-Shift-K, comment
 * with Mod-/, indent with Mod-] and Mod-[).
 */

/** Insert a blank line above the cursor and move to it, as Mod-Shift-Enter does in VS Code. */
function insertBlankLineAbove(view: EditorView): boolean {
  const changes = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.from)
    const indent = /^\s*/.exec(line.text)?.[0] ?? ''
    return {
      changes: { from: line.from, insert: `${indent}\n` },
      range: EditorSelection.cursor(line.from + indent.length),
    }
  })
  view.dispatch(changes, { scrollIntoView: true, userEvent: 'input' })
  return true
}

const vscodeKeymap: KeyBinding[] = [
  { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
  { key: 'Mod-Shift-l', run: selectSelectionMatches, preventDefault: true },
  { key: 'Mod-Alt-ArrowUp', run: addCursorAbove, preventDefault: true },
  { key: 'Mod-Alt-ArrowDown', run: addCursorBelow, preventDefault: true },
  { key: 'Mod-l', run: selectLine, preventDefault: true },
  { key: 'Mod-Enter', run: insertBlankLine },
  { key: 'Mod-Shift-Enter', run: insertBlankLineAbove },
]

/**
 * Tab indents (two spaces, the indentation YAML and MDC expect), Shift-Tab
 * dedents, and the selection can be multiple: Alt-click adds a cursor, Alt-drag
 * selects a rectangle, Mod-D grows the selection to the next occurrence.
 */
export function editorKeymap(): Extension {
  return [
    Prec.high(keymap.of([indentWithTab])),
    keymap.of([...vscodeKeymap, ...searchKeymap]),
    indentUnit.of('  '),
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
  ]
}
