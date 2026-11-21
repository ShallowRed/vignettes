import { parseLegend } from '@vignettes/schemas/runtime/legend.ts'
import { describe, expect, it } from 'vitest'

describe('schema legend', () => {
  it('reads the marks of the kit and the colors, and skips an entry without code or meaning', () => {
    expect(parseLegend('dashed=Asynchronous message | planned = Target state|green=The service|=Orphan|solid|#2a7f62=Partner')).toEqual([
      { mark: 'dashed', text: 'Asynchronous message' },
      { mark: 'planned', text: 'Target state' },
      { color: 'green', text: 'The service' },
      { color: '#2a7f62', text: 'Partner' },
    ])
  })

  it('keeps an equals sign inside the meaning', () => {
    expect(parseLegend('solid=a = b')).toEqual([{ mark: 'solid', text: 'a = b' }])
  })

  it('skips a mark the component does not draw', () => {
    expect(parseLegend('planned=Target state|dashed=Answer|orange=Draft', ['solid', 'dashed'])).toEqual([
      { mark: 'dashed', text: 'Answer' },
      { color: 'orange', text: 'Draft' },
    ])
  })

  it('gives no entry without a legend', () => {
    expect(parseLegend(undefined)).toEqual([])
  })
})
