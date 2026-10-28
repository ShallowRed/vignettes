import { diff } from '@codemirror/merge'
import { DIFF_CONFIG } from './diff-folding'

/**
 * The lines removed from `from` and added in `to`. Each distinct line becomes
 * one character, so the diff compares whole lines.
 */
export function changedLines(from: string, to: string): number {
  if (from === to)
    return 0
  const codes = new Map<string, string>()
  const encode = (text: string) => text.split('\n').map((line) => {
    if (!codes.has(line))
      codes.set(line, String.fromCodePoint(0x100 + codes.size))
    return codes.get(line)!
  }).join('')
  return diff(encode(from), encode(to), DIFF_CONFIG)
    .reduce((sum, change) => sum + change.toA - change.fromA + change.toB - change.fromB, 0)
}
