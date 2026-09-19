import type { EditorView } from '@codemirror/view'
import type { Translate } from '../config/editor-reference'

/** A fenced code block whose info string is `json`, located by the offsets of its content. */
export interface JsonBlock {
  /** Offset of the first content line. */
  from: number
  /** Offset of the end of the last content line (before its line break). */
  to: number
  /** Indentation of the opening fence, repeated on every formatted line. */
  indent: string
  /** Inside a `:::JsonTour`, whose `::Zone` line ranges point into this block. */
  inTour: boolean
}

const OPEN_RE = /^(\s*)(`{3,}|~{3,})\s*json(?:\s|\{|$)/i
const TOUR_OPEN_RE = /^\s*(:{2,})JsonTour\b/i
const BLOCK_CLOSE_RE = /^\s*(:{2,})\s*$/

/** The `json` code blocks of a markdown text, in document order. A block with no closing fence is ignored. */
export function jsonBlocks(text: string): JsonBlock[] {
  const blocks: JsonBlock[] = []
  const lines = text.split('\n')
  let offset = 0
  let open: { indent: string, fence: string, from: number } | null = null
  // Colon counts of the tours open at this line; a bare line of colons closes one.
  const tours: number[] = []
  for (const line of lines) {
    const end = offset + line.length
    if (open) {
      const trimmed = line.trim()
      if (trimmed.startsWith(open.fence) && trimmed.replaceAll(open.fence[0]!, '') === '') {
        blocks.push({ from: open.from, to: Math.max(open.from, offset - 1), indent: open.indent, inTour: tours.length > 0 })
        open = null
      }
    }
    else {
      const match = OPEN_RE.exec(line)
      if (match) {
        open = { indent: match[1]!, fence: match[2]!, from: end + 1 }
      }
      else {
        const tour = TOUR_OPEN_RE.exec(line)
        const close = BLOCK_CLOSE_RE.exec(line)
        if (tour)
          tours.push(tour[1]!.length)
        else if (close && tours.at(-1) === close[1]!.length)
          tours.pop()
      }
    }
    offset = end + 1
  }
  return blocks
}

export interface JsonFormatResult {
  changes: { from: number, to: number, insert: string }[]
  /** Blocks considered (the block under `at`, or all of them). */
  blocks: number
  /** Blocks left as they were because their content is not valid JSON. */
  invalid: number
  /** Blocks changed inside a `:::JsonTour`, whose zones name lines that may have moved. */
  tours: number
}

/**
 * Indents the `json` code blocks with two spaces. With `at`, only the block
 * containing that offset is formatted when there is one; otherwise every block.
 */
export function formatJsonBlocks(text: string, at?: number): JsonFormatResult {
  const all = jsonBlocks(text)
  const around = at === undefined ? undefined : all.find(block => at >= block.from && at <= block.to)
  const targets = around ? [around] : all
  const changes: JsonFormatResult['changes'] = []
  let invalid = 0
  let tours = 0
  for (const block of targets) {
    const source = text.slice(block.from, block.to)
    if (!source.trim())
      continue
    let value: unknown
    try {
      value = JSON.parse(source)
    }
    catch {
      invalid++
      continue
    }
    const insert = JSON.stringify(value, null, 2).split('\n').map(line => block.indent + line).join('\n')
    if (insert === source)
      continue
    changes.push({ from: block.from, to: block.to, insert })
    if (block.inTour)
      tours++
  }
  return { changes, blocks: targets.length, invalid, tours }
}

/** Formats the `json` block under the caret, or every `json` block, as one undoable change. */
export function formatJson(view: EditorView): JsonFormatResult {
  const result = formatJsonBlocks(view.state.doc.toString(), view.state.selection.main.head)
  if (result.changes.length)
    view.dispatch({ changes: result.changes })
  view.focus()
  return result
}

/** The toast shown after formatting, or null when blocks were formatted without anything to say. */
export function jsonFormatNotice(result: JsonFormatResult, t: Translate): { title: string, description?: string, color: 'neutral' | 'warning' } | null {
  if (!result.blocks)
    return { title: t('editor.json.noBlock'), color: 'neutral' }
  if (result.invalid)
    return { title: t('editor.json.invalidLeft', result.invalid), color: 'warning' }
  if (result.tours)
    return { title: t('editor.json.tourFormatted', result.tours), description: t('editor.json.tourZonesMoved'), color: 'warning' }
  return null
}
