import type { ColumnPart } from '@vignettes/core/deck'
import { columnGroups } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

// A child is written as its part and a name: `column:a`, `rule`, `heading:b`, `other:c`.
const partOf = (child: string) => child.split(':')[0] as ColumnPart

describe('columnGroups', () => {
  it('keeps the children of a block that holds two Column blocks or more', () => {
    expect(columnGroups(['column:a', 'other:b', 'column:c'], partOf)).toBeUndefined()
  })

  it('splits at the first horizontal rule', () => {
    expect(columnGroups(['other:a', 'rule', 'other:b', 'rule', 'other:c'], partOf)).toEqual([['other:a'], ['other:b', 'rule', 'other:c']])
  })

  it('splits before each heading, the text before the first one in the first column', () => {
    expect(columnGroups(['other:a', 'heading:b', 'other:c', 'heading:d'], partOf)).toEqual([['other:a'], ['heading:b', 'other:c'], ['heading:d']])
  })

  it('keeps whole a block that gives one column, a single Column among other blocks included', () => {
    expect(columnGroups(['other:a', 'column:b'], partOf)).toBeUndefined()
    expect(columnGroups(['heading:a', 'other:b'], partOf)).toBeUndefined()
    expect(columnGroups([], partOf)).toBeUndefined()
  })
})
