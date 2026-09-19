import type { Extension, Text } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { getChunks } from '@codemirror/merge'
import { Facet, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

/**
 * Folding of the identical passages of a read-only unified diff. Each passage
 * long enough is replaced by a band that unfolds it on click; an unfolded
 * passage keeps a band on its first line that folds it again. The library's
 * own collapsing only unfolds, and its widget cannot be styled or translated.
 */

/** Lines of context kept around a change, and the shortest passage worth folding. */
export const MARGIN = 3
export const MIN_LINES = 4

/**
 * How far the diff searches before it gives a coarse answer: the merge view's
 * own default, named so the skeleton computes the very same chunks.
 */
export const DIFF_CONFIG = { scanLimit: 500 }

export interface Passage {
  /** Start of its first line and end of its last line. */
  from: number
  to: number
  lines: number
}

/** The text of a band, from the number of lines of its passage. */
export interface FoldLabels {
  unfold: (lines: number) => string
  fold: (lines: number) => string
}

const foldLabels = Facet.define<FoldLabels, FoldLabels>({
  combine: values => values[0] ?? { unfold: String, fold: String },
})

const toggle = StateEffect.define<number>()
const setPassages = StateEffect.define<Passage[]>()

class FoldBand extends WidgetType {
  constructor(readonly passage: Passage, readonly open: boolean) {
    super()
  }

  eq(other: FoldBand) {
    return other.passage.from === this.passage.from && other.open === this.open
  }

  toDOM(view: EditorView) {
    const band = document.createElement('button')
    band.type = 'button'
    band.className = `diff-fold${this.open ? ' diff-fold--open' : ''}`
    const labels = view.state.facet(foldLabels)
    band.textContent = this.open ? labels.fold(this.passage.lines) : labels.unfold(this.passage.lines)
    band.addEventListener('click', () => view.dispatch({ effects: toggle.of(this.passage.from) }))
    return band
  }

  ignoreEvent() {
    return false
  }

  get estimatedHeight() {
    return 28
  }
}

/** The identical passages of `doc`, the modified side of a diff, from its chunks. */
export function identicalPassages(doc: Text, chunks: readonly { fromB: number, toB: number }[]): Passage[] {
  const passages: Passage[] = []
  let previousLine = 1
  for (let i = 0; ; i++) {
    const chunk = chunks[i]
    const fromLine = i ? previousLine + MARGIN : 1
    const toLine = chunk ? doc.lineAt(chunk.fromB).number - 1 - MARGIN : doc.lines
    const lines = toLine - fromLine + 1
    if (lines >= MIN_LINES)
      passages.push({ from: doc.line(fromLine).from, to: doc.line(toLine).to, lines })
    if (!chunk)
      break
    previousLine = doc.lineAt(Math.min(doc.length, chunk.toB)).number
  }
  return passages
}

function passagesOf(view: EditorView): Passage[] {
  return identicalPassages(view.state.doc, getChunks(view.state)?.chunks ?? [])
}

function decorate(passages: Passage[], open: Set<number>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const passage of passages) {
    if (open.has(passage.from))
      builder.add(passage.from, passage.from, Decoration.widget({ widget: new FoldBand(passage, true), block: true, side: -1 }))
    else
      builder.add(passage.from, passage.to, Decoration.replace({ widget: new FoldBand(passage, false), block: true }))
  }
  return builder.finish()
}

interface Folding {
  passages: Passage[]
  open: Set<number>
}

// The document never changes: the passages are computed once, on the first
// view, and the folds only follow the toggles.
const foldingField = StateField.define<Folding>({
  create: () => ({ passages: [], open: new Set() }),
  update(folding, transaction) {
    let open = folding.open
    for (const effect of transaction.effects) {
      if (effect.is(toggle)) {
        open = new Set(open)
        if (open.has(effect.value))
          open.delete(effect.value)
        else
          open.add(effect.value)
      }
      if (effect.is(setPassages))
        return { passages: effect.value, open: new Set() }
    }
    return open === folding.open ? folding : { ...folding, open }
  },
  provide: field => EditorView.decorations.from(field, folding => decorate(folding.passages, folding.open)),
})

/** The folds of a unified merge view created without `collapseUnchanged`; `foldIdenticalPassages` fills them once the view exists. */
export function diffFolding(labels: FoldLabels): Extension {
  return [foldLabels.of(labels), foldingField]
}

/** Computes the passages of the view and folds them all. */
export function foldIdenticalPassages(view: EditorView): void {
  const passages = passagesOf(view)
  if (passages.length)
    view.dispatch({ effects: setPassages.of(passages) })
}
