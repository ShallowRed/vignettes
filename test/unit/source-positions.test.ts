import { isSourceAttribute, readSourceRange, SOURCE_ATTRIBUTE, SOURCE_TEXT_ATTRIBUTE, sourceRangeValue } from '@vignettes/core/render'
import { describe, expect, it } from 'vitest'

describe('source ranges as attribute values', () => {
  it('reads back the value it writes', () => {
    expect(readSourceRange(sourceRangeValue({ from: 3, to: 12 }))).toEqual({ from: 3, to: 12 })
    expect(readSourceRange('0-0')).toEqual({ from: 0, to: 0 })
  })

  it('reads no range from another value', () => {
    for (const value of [undefined, null, 12, '', '12', '3-', '-3', '5-3', '1.5-3', ' 1-3', '1-3 ', 'a-b'])
      expect(readSourceRange(value), String(value)).toBeUndefined()
  })

  it('knows the two attributes in the spellings MDC gives them', () => {
    for (const name of [SOURCE_ATTRIBUTE, SOURCE_TEXT_ATTRIBUTE, 'dataSource', 'dataSourceText', 'DATA-SOURCE', ':data-source'])
      expect(isSourceAttribute(name), name).toBe(true)
    for (const name of ['data-src', 'source', 'data-sources', 'dataSourceTexts'])
      expect(isSourceAttribute(name), name).toBe(false)
  })
})
