import type { ParserId } from './parser.ts'
import type { SlideTitle } from './split.ts'
import type { TextChange } from './text-edits.ts'
import type { TextRefusal } from './typed-text.ts'
import { slideTitle, splitSlides } from './split.ts'
import { applyTextChanges, contentRange, lineStarts } from './text-edits.ts'
import { typedTextChange } from './typed-text.ts'

/**
 * The outline of a deck, and the edits of its slides that the outline of the
 * editor sends: each rewrites the ranges of the slides it moves, copies,
 * removes or renames, and leaves the other slides as they are written.
 */

/** A slide of the outline, with the offsets of its text and of its title in the deck. */
export interface OutlineSlide {
  h: number
  v: number
  from: number
  to: number
  /** The start of its text after its blank lines, where the caret goes to show the slide. */
  contentFrom: number
  title?: SlideTitle
}

/** Changes that do not overlap, sent in one transaction, and where the caret goes in the deck once changed. */
export interface OutlineEdit {
  changes: TextChange[]
  anchor: number
}

// What separates two stacks, and two slides of a stack, in each syntax: a
// heading deck needs a blank line, a separator deck its separator lines. The
// break takes the line endings of the deck.
const STACK_BREAK: Record<ParserId, string> = { heading: '\n\n', separator: '\n\n---\n\n' }
const SLIDE_BREAK: Record<ParserId, string> = { heading: '\n\n', separator: '\n\n----\n\n' }
const lineBreak = (raw: string, text: string) => raw.includes('\r\n') ? text.replaceAll('\n', '\r\n') : text

/** The slides of a deck in the order of `splitSlides`, with their titles. */
export function deckOutline(raw: string, parser: ParserId): OutlineSlide[] {
  const starts = lineStarts(raw)
  return splitSlides(raw, parser).map(({ h, v, startLine, text }) => {
    const from = starts[startLine - 1]!
    const to = from + text.length
    const title = slideTitle(text)
    return { h, v, from, to, contentFrom: contentRange(raw, from, to).from, ...(title ? { title: { ...title, from: from + title.from, to: from + title.to } } : {}) }
  })
}

/** A text without its blank lines at both ends. */
function content(text: string): string {
  const range = contentRange(text, 0, text.length)
  return text.slice(range.from, range.to)
}

interface Stack {
  from: number
  to: number
  slides: OutlineSlide[]
}

function stacksOf(outline: OutlineSlide[]): Stack[] {
  const stacks: Stack[] = []
  for (const slide of outline) {
    const stack = stacks[slide.h]
    if (stack) {
      stack.to = slide.to
      stack.slides.push(slide)
    }
    else {
      stacks[slide.h] = { from: slide.from, to: slide.to, slides: [slide] }
    }
  }
  return stacks
}

/** A slide of the deck the edit should give: its text without its blank lines at both ends. */
interface Expected {
  h: number
  v: number
  text: string
}

function expectedOf(raw: string, stacks: Stack[]): Expected[][] {
  return stacks.map(stack => stack.slides.map(slide => ({ h: slide.h, v: slide.v, text: content(raw.slice(slide.from, slide.to)) })))
}

/**
 * The edit, when the changed deck has the slides `expected` gives: the same
 * texts, at the same places. The caret goes to the start of the text of the
 * slide at `target`.
 */
function checked(raw: string, parser: ParserId, changes: TextChange[], expected: Expected[][], target: { h: number, v: number }): OutlineEdit | undefined {
  const after = applyTextChanges(raw, changes)
  const slides = deckOutline(after, parser)
  const flat = expected.flatMap((stack, h) => stack.map((slide, v) => ({ ...slide, h, v })))
  const same = slides.length === flat.length
    && slides.every((slide, index) => slide.h === flat[index]!.h && slide.v === flat[index]!.v && content(after.slice(slide.from, slide.to)) === flat[index]!.text)
  const found = slides.find(slide => slide.h === target.h && slide.v === target.v)
  if (!same || !found)
    return undefined
  return { changes: [...changes].sort((a, b) => a.from - b.from), anchor: found.contentFrom }
}

/**
 * The removal of a part of the deck with the break before it, or, for the
 * first part, with the break after it: the blank lines before the first part
 * stay, and the next part starts where the first one started.
 */
function removal(raw: string, parts: { from: number, to: number }[], index: number): TextChange {
  const part = parts[index]!
  if (index === 0)
    return { from: contentRange(raw, part.from, part.to).from, to: contentRange(raw, parts[1]!.from, parts[1]!.to).from, insert: '' }
  return { from: contentRange(raw, parts[index - 1]!.from, parts[index - 1]!.to).to, to: contentRange(raw, part.from, part.to).to, insert: '' }
}

/** Moves the stack at `h` so that it ends at place `to`. */
export function moveStackEdit(raw: string, parser: ParserId, h: number, to: number): OutlineEdit | undefined {
  const stacks = stacksOf(deckOutline(raw, parser))
  const stack = stacks[h]
  if (!stack || to === h || to < 0 || to >= stacks.length)
    return undefined
  const text = content(raw.slice(stack.from, stack.to))
  // At the first place the break follows the stack, elsewhere it comes after
  // the stack it then follows.
  const before = stacks[to > h ? to : to - 1]
  const at = before ? contentRange(raw, before.from, before.to).to : contentRange(raw, stacks[0]!.from, stacks[0]!.to).from
  const separator = lineBreak(raw, STACK_BREAK[parser])
  const insertion = { from: at, to: at, insert: before ? `${separator}${text}` : `${text}${separator}` }
  const expected = expectedOf(raw, stacks)
  const [moved] = expected.splice(h, 1)
  expected.splice(to, 0, moved!)
  return checked(raw, parser, [removal(raw, stacks, h), insertion], expected, { h: to, v: 0 })
}

/** Copies the stack at `h` when `v` is 0, the vertical slide at `h`, `v` otherwise, after it. */
export function duplicateEdit(raw: string, parser: ParserId, h: number, v: number): OutlineEdit | undefined {
  const stacks = stacksOf(deckOutline(raw, parser))
  const stack = stacks[h]
  const part = v === 0 ? stack : stack?.slides[v]
  if (!stack || !part)
    return undefined
  const range = contentRange(raw, part.from, part.to)
  const text = raw.slice(range.from, range.to)
  const insert = `${lineBreak(raw, v === 0 ? STACK_BREAK[parser] : SLIDE_BREAK[parser])}${text}`
  const expected = expectedOf(raw, stacks)
  if (v === 0)
    expected.splice(h + 1, 0, expected[h]!.map(slide => ({ ...slide })))
  else
    expected[h]!.splice(v + 1, 0, { ...expected[h]![v]! })
  return checked(raw, parser, [{ from: range.to, to: range.to, insert }], expected, v === 0 ? { h: h + 1, v: 0 } : { h, v: v + 1 })
}

/** Removes the stack at `h` when `v` is 0, the vertical slide at `h`, `v` otherwise; a deck keeps one stack. */
export function removeEdit(raw: string, parser: ParserId, h: number, v: number): OutlineEdit | undefined {
  const stacks = stacksOf(deckOutline(raw, parser))
  const stack = stacks[h]
  if (!stack || !stack.slides[v] || (v === 0 && stacks.length === 1))
    return undefined
  const expected = expectedOf(raw, stacks)
  if (v === 0) {
    expected.splice(h, 1)
    return checked(raw, parser, [removal(raw, stacks, h)], expected, { h: Math.min(h, stacks.length - 2), v: 0 })
  }
  expected[h]!.splice(v, 1)
  return checked(raw, parser, [removal(raw, stack.slides, v)], expected, { h, v: Math.min(v, stack.slides.length - 2) })
}

/**
 * The change that writes `typed` as the title of the slide at `h`, `v`, over
 * `written`, the source of the title when the rename started: a title that
 * another person changed, or moved with its slide, in the meantime is a
 * conflict.
 */
export function renameChange(raw: string, parser: ParserId, h: number, v: number, written: string, typed: string): TextChange | TextRefusal | undefined {
  const title = deckOutline(raw, parser).find(slide => slide.h === h && slide.v === v)?.title
  return title ? typedTextChange(raw, title, written, typed, title.underlined ? 'underlined-heading' : 'heading', parser) : 'conflict'
}
