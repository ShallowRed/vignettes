import { describe, expect, it } from 'vitest'
import { formatJsonBlocks, jsonBlockAt, jsonBlocks } from '../../layers/studio/src/utils/editor-json'

function apply(text: string, at?: number) {
  const { changes } = formatJsonBlocks(text, at)
  return [...changes].reverse().reduce((out, change) => out.slice(0, change.from) + change.insert + out.slice(change.to), text)
}

describe('jsonBlocks', () => {
  it('finds json fences only, closed ones', () => {
    const text = ['```js', '{}', '```', '```json', '{"a":1}', '```', '~~~ JSON {2}', '[1]', '~~~', '```json', 'open'].join('\n')
    expect(jsonBlocks(text).map(block => text.slice(block.from, block.to))).toEqual(['{"a":1}', '[1]'])
  })

  it('ignores jsonc and json5', () => {
    expect(jsonBlocks('```jsonc\n{}\n```\n```json5\n{}\n```')).toEqual([])
  })
})

describe('jsonBlockAt', () => {
  it('finds the block whose content holds the offset, and none on its fences', () => {
    const text = 'a\n```json\n{"a":1}\n```\nb'
    expect(jsonBlockAt(text, text.indexOf('"a"'))).toMatchObject({ from: text.indexOf('{') })
    expect(jsonBlockAt(text, text.indexOf('json'))).toBeUndefined()
    expect(jsonBlockAt(text, text.lastIndexOf('b'))).toBeUndefined()
  })
})

describe('formatJsonBlocks', () => {
  it('indents every block with two spaces', () => {
    const text = '# T\n\n```json\n{"a":[1,2],"b":{"c":true}}\n```\n'
    expect(apply(text)).toBe('# T\n\n```json\n{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": true\n  }\n}\n```\n')
  })

  it('keeps the fence indentation', () => {
    expect(apply('  ```json\n  {"a":1}\n  ```')).toBe('  ```json\n  {\n    "a": 1\n  }\n  ```')
  })

  it('formats only the block under the caret', () => {
    const text = '```json\n{"a":1}\n```\n\n```json\n{"b":2}\n```'
    const at = text.indexOf('"b"')
    expect(apply(text, at)).toBe('```json\n{"a":1}\n```\n\n```json\n{\n  "b": 2\n}\n```')
  })

  it('leaves invalid json as it is and counts it', () => {
    const text = '```json\n{a: 1}\n```\n```json\n{"b":2}\n```'
    const result = formatJsonBlocks(text)
    expect(result.invalid).toBe(1)
    expect(result.changes).toHaveLength(1)
  })

  it('counts the changed blocks of a json tour, whose zones name lines', () => {
    const text = ':::JsonTour\n::Zone{lines="1"}\n::\n```json\n{"a":1}\n```\n:::\n\n```json\n{"b":2}\n```'
    expect(jsonBlocks(text).map(block => block.inTour)).toEqual([true, false])
    expect(formatJsonBlocks(text).tours).toBe(1)
    expect(formatJsonBlocks('```json\n{"a":1}\n```').tours).toBe(0)
  })

  it('reports no change on formatted json', () => {
    expect(formatJsonBlocks('```json\n{\n  "a": 1\n}\n```').changes).toEqual([])
  })
})
