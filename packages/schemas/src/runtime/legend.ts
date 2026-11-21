/**
 * Entries of the `legend` attribute of a `:::Diagram` or a `:::Sequence`:
 * `code=meaning` separated by `|`. A code is a line or a card of the kit
 * (`solid`, `dashed`, `planned`, `emphasis`, `flow`), or a color as `color`
 * takes it.
 */
import { pairs } from './pairs.ts'

export const LEGEND_MARKS = ['solid', 'dashed', 'planned', 'emphasis', 'flow'] as const
export type LegendMark = typeof LEGEND_MARKS[number]

export type LegendEntry
  = | { mark: LegendMark, text: string }
    | { color: string, text: string }

/** The entries of `source`; a mark outside `marks`, which the component does not draw, is skipped. */
export function parseLegend(source?: string, marks: readonly LegendMark[] = LEGEND_MARKS): LegendEntry[] {
  return pairs(source).flatMap(({ key, value }): LegendEntry[] => {
    if (!key || !value)
      return []
    if (!(LEGEND_MARKS as readonly string[]).includes(key))
      return [{ color: key, text: value }]
    return marks.includes(key as LegendMark) ? [{ mark: key as LegendMark, text: value }] : []
  })
}
