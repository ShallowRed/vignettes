import type { EditorState, Extension, Range } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import type { Translate } from '../config/editor-reference'
import { codeFolding, foldEffect, foldGutter, foldKeymap, foldService, unfoldAll } from '@codemirror/language'
import { Prec, RangeSet, StateField } from '@codemirror/state'
import { Decoration, EditorView, gutterLineClass, GutterMarker, keymap, lineNumbers, MatchDecorator, ViewPlugin } from '@codemirror/view'
import { parserIdFor, slideRanges, slideTitle, splitFrontmatter } from '@vignettes/core/deck'

/**
 * The deck structure in the markdown pane: line numbers, the lines of the slide
 * under the caret, a fold per slide and per frontmatter, and colors for the MDC
 * components and their attributes.
 */

/** Lines of one slide, its separator included (1-based, inclusive). */
export interface SlideBlock {
  from: number
  to: number
}

interface DeckStructure {
  /** Last line of the frontmatter, 0 without one. */
  frontmatterEnd: number
  blocks: SlideBlock[]
}

const SEPARATOR_RE = /^\s*-{3,4}\s*$/
export const HEADING_RE = /^(#{1,6})\s/

function readStructure(state: EditorState): DeckStructure {
  const text = state.doc.toString()
  const ranges = slideRanges(text, parserIdFor(splitFrontmatter(text).data))
  const doc = state.doc
  let frontmatterEnd = 0
  if (doc.lines > 1 && doc.line(1).text.trim() === '---') {
    for (let n = 2; n <= doc.lines; n++) {
      if (doc.line(n).text.trim() === '---') {
        frontmatterEnd = n
        break
      }
    }
  }
  // A slide opened by a separator shows it as its first line.
  const starts = ranges.map(({ startLine }) =>
    startLine - 1 > frontmatterEnd && startLine - 1 >= 1 && SEPARATOR_RE.test(doc.line(startLine - 1).text) ? startLine - 1 : startLine)
  const blocks = starts
    .map((from, index) => ({ from, to: (starts[index + 1] ?? doc.lines + 1) - 1 }))
    .filter(block => block.from <= doc.lines && block.to >= block.from)
  return { frontmatterEnd, blocks }
}

const structureField = StateField.define<DeckStructure>({
  create: readStructure,
  update: (value, tr) => tr.docChanged ? readStructure(tr.state) : value,
})

function blockAt(blocks: SlideBlock[], line: number): SlideBlock | undefined {
  let found: SlideBlock | undefined
  for (const block of blocks) {
    if (block.from > line)
      break
    found = block
  }
  return found
}

function slideBlockAt(state: EditorState, line: number): SlideBlock | undefined {
  return blockAt(state.field(structureField).blocks, line)
}

/**
 * The lines of the slide at `line`, without the separator that opens it: `from`
 * is the line after the separator. A line of the frontmatter gives the first slide.
 */
export function slideContentAt(state: EditorState, line: number): SlideBlock | undefined {
  const { frontmatterEnd, blocks } = state.field(structureField)
  const block = blockAt(blocks, Math.max(line, frontmatterEnd + 1))
  if (!block)
    return undefined
  const opened = block.from > frontmatterEnd && SEPARATOR_RE.test(state.doc.line(block.from).text)
  return { from: opened ? block.from + 1 : block.from, to: block.to }
}

// ── Current slide ────────────────────────────────────────────────────────────

const currentLine = Decoration.line({ class: 'cm-current-slide' })
const currentGutter = new class extends GutterMarker {
  override elementClass = 'cm-current-slide-gutter'
}()

interface CurrentSlide {
  lines: DecorationSet
  gutter: RangeSet<GutterMarker>
}

function markCurrentSlide(state: EditorState): CurrentSlide {
  const block = slideBlockAt(state, state.doc.lineAt(state.selection.main.head).number)
  const lines: Range<Decoration>[] = []
  const gutter: Range<GutterMarker>[] = []
  if (block) {
    for (let n = block.from; n <= block.to; n++) {
      const from = state.doc.line(n).from
      lines.push(currentLine.range(from))
      gutter.push(currentGutter.range(from))
    }
  }
  return { lines: Decoration.set(lines), gutter: RangeSet.of(gutter) }
}

const currentSlideField = StateField.define<CurrentSlide>({
  create: markCurrentSlide,
  update: (value, tr) => tr.docChanged || tr.selection ? markCurrentSlide(tr.state) : value,
  provide: field => [
    EditorView.decorations.from(field, value => value.lines),
    gutterLineClass.from(field, value => value.gutter),
  ],
})

// ── Folding ─────────────────────────────────────────────────────────────────

/** The last line of a range that holds text, so a fold keeps the blank lines. */
function lastFilledLine(state: EditorState, from: number, to: number): number {
  let n = to
  while (n > from && !state.doc.line(n).text.trim())
    n--
  return n
}

/** The first line of a range that holds text, where its fold marker sits. */
function firstFilledLine(state: EditorState, from: number, to: number): number {
  let n = from
  while (n < to && !state.doc.line(n).text.trim())
    n++
  return n
}

function foldRange(state: EditorState, line: number, to: number) {
  const end = lastFilledLine(state, line, to)
  return end > line ? { from: state.doc.line(line).to, to: state.doc.line(end).to } : null
}

/**
 * Folds, in order: the frontmatter, each slide from its first line, and a
 * heading inside a slide up to the next heading of its level or the slide end.
 * Markdown's own heading fold would run past the slide separators.
 */
const slideFolding = Prec.high(foldService.of((state, lineStart) => {
  const { frontmatterEnd, blocks } = state.field(structureField)
  const line = state.doc.lineAt(lineStart)
  if (line.number === 1 && frontmatterEnd)
    return foldRange(state, 1, frontmatterEnd)
  const block = blockAt(blocks, line.number)
  if (!block)
    return null
  if (firstFilledLine(state, block.from, block.to) === line.number)
    return foldRange(state, line.number, block.to)
  if (line.number < firstFilledLine(state, block.from, block.to))
    return null
  const heading = HEADING_RE.exec(line.text)
  if (!heading)
    return null
  let end = block.to
  for (let n = line.number + 1; n <= block.to; n++) {
    const next = HEADING_RE.exec(state.doc.line(n).text)
    if (next && next[1]!.length <= heading[1]!.length) {
      end = n - 1
      break
    }
  }
  return foldRange(state, line.number, end)
}))

interface FoldSummary {
  label: string
  lines: number
}

/** What a folded range stands for: its slide title, or `frontmatterLabel`. */
function summarize(state: EditorState, range: { from: number, to: number }, frontmatterLabel: string): FoldSummary {
  const first = state.doc.lineAt(range.from)
  const last = state.doc.lineAt(range.to)
  const lines = last.number - first.number
  if (first.number === 1)
    return { label: frontmatterLabel, lines }
  if (!SEPARATOR_RE.test(first.text) || first.number === last.number)
    return { label: '', lines }
  return { label: slideTitle(state.sliceDoc(state.doc.line(first.number + 1).from, last.to))?.text ?? '', lines }
}

function folding(t: Translate): Extension {
  const frontmatterLabel = t('editor.folds.frontmatter')
  const unfoldLabel = t('editor.folds.unfold')
  return [
    codeFolding({
      preparePlaceholder: (state, range) => summarize(state, range, frontmatterLabel),
      placeholderDOM: (_view, onclick, prepared: FoldSummary) => {
        const element = document.createElement('span')
        element.className = 'cm-slide-fold'
        element.title = unfoldLabel
        element.onclick = onclick
        if (prepared.label) {
          const label = document.createElement('span')
          label.className = 'cm-slide-fold__label'
          label.textContent = prepared.label
          element.append(label)
        }
        const count = document.createElement('span')
        count.className = 'cm-slide-fold__count'
        count.textContent = t('editor.folds.lineCount', prepared.lines)
        element.append(count)
        return element
      },
    }),
    foldGutter({
      markerDOM: (open) => {
        const marker = document.createElement('span')
        marker.className = `cm-fold-marker${open ? '' : ' cm-fold-marker--closed'}`
        marker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"/></svg>'
        return marker
      },
    }),
    keymap.of(foldKeymap),
  ]
}

/** Folds every slide except the one under the caret, and the frontmatter. */
export function foldOtherSlides(view: EditorView): void {
  const { state } = view
  const { frontmatterEnd, blocks } = state.field(structureField)
  const current = slideBlockAt(state, state.doc.lineAt(state.selection.main.head).number)
  const effects = []
  if (frontmatterEnd) {
    const range = foldRange(state, 1, frontmatterEnd)
    if (range)
      effects.push(foldEffect.of(range))
  }
  for (const block of blocks) {
    if (block === current)
      continue
    const range = foldRange(state, firstFilledLine(state, block.from, block.to), block.to)
    if (range)
      effects.push(foldEffect.of(range))
  }
  view.dispatch({ effects })
}

export { unfoldAll }

// ── MDC components ──────────────────────────────────────────────────────────

const componentName = Decoration.mark({ class: 'cm-mdc-name' })
const attributeName = Decoration.mark({ class: 'cm-mdc-attribute' })
const attributeValue = Decoration.mark({ class: 'cm-mdc-value' })
const blockClose = Decoration.mark({ class: 'cm-mdc-close' })

// `:name`, `::name` and `:::name` at the start of a line or after a space, with
// their `{…}` attributes; a line of colons closes a block component.
const COMPONENT_RE = /(^|\s)(:{1,3}[A-Z][\w-]*)(\{[^}\n]*\})?|^\s*:{2,}\s*$/gi
const ATTRIBUTE_RE = /(:?[\w-]+)(?:=("[^"]*"|'[^']*'|[^\s}]+))?/g

const components = new MatchDecorator({
  regexp: COMPONENT_RE,
  decorate: (add, from, _to, match) => {
    if (!match[2]) {
      add(from, _to, blockClose)
      return
    }
    const nameFrom = from + match[1]!.length
    add(nameFrom, nameFrom + match[2].length, componentName)
    if (!match[3])
      return
    const bracesFrom = nameFrom + match[2].length
    const inner = match[3].slice(1, -1)
    for (const attribute of inner.matchAll(ATTRIBUTE_RE)) {
      const at = bracesFrom + 1 + attribute.index
      add(at, at + attribute[1]!.length, attributeName)
      if (attribute[2]) {
        const valueFrom = at + attribute[0].length - attribute[2].length
        add(valueFrom, valueFrom + attribute[2].length, attributeValue)
      }
    }
  },
})

const componentHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) {
    this.decorations = components.createDeco(view)
  }

  update(update: ViewUpdate) {
    this.decorations = components.updateDeco(update, this.decorations)
  }
}, { decorations: plugin => plugin.decorations })

// ── Frontmatter ─────────────────────────────────────────────────────────────

// Markdown reads a frontmatter line followed by the closing `---` as a heading;
// the line mark cancels that styling.
const yamlLine = Decoration.mark({ class: 'cm-yaml-line' })
const yamlKey = Decoration.mark({ class: 'cm-yaml-key' })
const yamlString = Decoration.mark({ class: 'cm-yaml-string' })
const yamlLiteral = Decoration.mark({ class: 'cm-yaml-literal' })
const yamlComment = Decoration.mark({ class: 'cm-yaml-comment' })

// A `key: value` or `- value` line; the rest splits into value and comment.
const YAML_LINE_RE = /^(\s*)(?:(- )|([\w.-]+)(:))(.*)$/g
const YAML_LITERAL_RE = /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/
const YAML_STRING_RE = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')$/

const frontmatter = new MatchDecorator({
  regexp: YAML_LINE_RE,
  decorate: (add, from, to, match, view) => {
    const { frontmatterEnd } = view.state.field(structureField)
    const line = view.state.doc.lineAt(from).number
    if (line <= 1 || line >= frontmatterEnd)
      return
    if (to > from)
      add(from, to, yamlLine)
    let at = from + match[1]!.length
    if (match[3]) {
      add(at, at + match[3].length, yamlKey)
      at += match[3].length + 1
    }
    else {
      at += 2
    }
    const rest = match[5]!
    const hash = rest.search(/(?:^|\s)#/)
    const valuePart = hash === -1 ? rest : rest.slice(0, hash)
    const value = valuePart.trim()
    const valueFrom = at + valuePart.length - valuePart.trimStart().length
    if (value && (YAML_STRING_RE.test(value) || YAML_LITERAL_RE.test(value)))
      add(valueFrom, valueFrom + value.length, YAML_STRING_RE.test(value) ? yamlString : yamlLiteral)
    if (hash !== -1) {
      const commentFrom = at + rest.indexOf('#', hash)
      add(commentFrom, at + rest.length, yamlComment)
    }
  },
})

const frontmatterHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  frontmatterEnd: number
  constructor(view: EditorView) {
    this.decorations = frontmatter.createDeco(view)
    this.frontmatterEnd = view.state.field(structureField).frontmatterEnd
  }

  update(update: ViewUpdate) {
    const end = update.state.field(structureField).frontmatterEnd
    // A moved closing fence changes which lines are frontmatter.
    this.decorations = end === this.frontmatterEnd
      ? frontmatter.updateDeco(update, this.decorations)
      : frontmatter.createDeco(update.view)
    this.frontmatterEnd = end
  }
}, { decorations: plugin => plugin.decorations })

/** Everything the pane adds to CodeMirror for the deck structure. */
export function deckStructure(t: Translate): Extension[] {
  return [
    structureField,
    lineNumbers(),
    folding(t),
    slideFolding,
    currentSlideField,
    componentHighlight,
    frontmatterHighlight,
  ]
}
