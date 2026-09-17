import { Chunk } from '@codemirror/merge'
import { Text } from '@codemirror/state'
import { DIFF_CONFIG, identicalPassages } from './diff-folding'

/**
 * The shape of a unified diff before its editor exists: the same chunks and
 * the same folded passages as `DeckVersionDiff` will draw, as rows a skeleton
 * lays out on the editor's grid, with the text of each line so the rows wrap
 * exactly where the editor wraps them. Computed from the two texts alone, so
 * the editor replaces the skeleton without moving anything.
 */

export type SkeletonRow
  = { kind: 'band' }
    | {
      kind: 'line'
      tone: 'context' | 'removed' | 'added'
      text: string
      /** The line number in the modified text; a removed line has none. */
      number?: number
    }

export interface DiffStructure {
  rows: SkeletonRow[]
  /** Number of changed passages. */
  chunks: number
  /** Digits of the last line number, which set the width of the gutter. */
  digits: number
}

/** Rows beyond the first screen are never seen. */
const MAX_ROWS = 80

export function diffStructure(from: string, to: string): DiffStructure {
  const a = Text.of(from.split('\n'))
  const b = Text.of(to.split('\n'))
  // Two identical texts are shown whole, without folds.
  const chunks = from === to ? [] : Chunk.build(a, b, DIFF_CONFIG)
  const passages = from === to ? [] : identicalPassages(b, chunks)
  const rows: SkeletonRow[] = []
  let chunkIndex = 0
  let passageIndex = 0
  for (let number = 1; number <= b.lines && rows.length < MAX_ROWS; number++) {
    const line = b.line(number)
    const passage = passages[passageIndex]
    if (passage && line.from === passage.from) {
      rows.push({ kind: 'band' })
      number = b.lineAt(passage.to).number
      passageIndex++
      continue
    }
    const chunk = chunks[chunkIndex]
    if (chunk && line.from >= chunk.fromB && line.from < Math.max(chunk.toB, chunk.fromB + 1)) {
      if (line.from === chunk.fromB && chunk.toA > chunk.fromA) {
        const first = a.lineAt(chunk.fromA).number
        const last = a.lineAt(chunk.toA - 1).number
        for (let removed = first; removed <= last; removed++)
          rows.push({ kind: 'line', tone: 'removed', text: a.line(removed).text })
      }
      rows.push({ kind: 'line', tone: 'added', text: line.text, number })
      if (line.to >= chunk.toB - 1)
        chunkIndex++
      continue
    }
    rows.push({ kind: 'line', tone: 'context', text: line.text, number })
  }
  return { rows, chunks: chunks.length, digits: String(b.lines).length }
}
