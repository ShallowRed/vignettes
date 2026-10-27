import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { bodySource } from '../../layers/studio/src/utils/editor-completions'

const t = ((key: string, named?: Record<string, unknown>) => named ? `${key} ${JSON.stringify(named)}` : key) as Parameters<typeof bodySource>[1]
const source = bodySource({ lang: 'fr', docsUrl: () => undefined }, t)

// The completion at the end of `doc`.
function complete(doc: string) {
  const state = EditorState.create({ doc })
  return source(new CompletionContext(state, doc.length, true))
}

describe('component attribute completion', () => {
  it('offers the attributes of a component but those written, a true one as its false form', () => {
    const result = complete('::Fragments{dim ')
    expect(result?.options.map(option => option.label)).toEqual(['effect', 'collapse'])
    expect(complete(':::Columns{')?.options.map(option => option.label)).toEqual(['size'])
  })

  it('offers the closed values of an attribute, and true or false after a colon', () => {
    expect(complete(':::Columns{size="')?.options.map(option => option.label)).toEqual(['xs', 'sm', 'md', 'lg', 'xl'])
    expect(complete('::Fragments{:dim="')?.options.map(option => option.label)).toEqual(['true', 'false'])
    expect(complete('::Fragments{effect="')).toBeNull()
  })
})
