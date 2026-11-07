import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { registerDeckComponents, resetDeckComponents } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bodySource } from '../../layers/studio/src/utils/editor-completions'
import { symbolChange, symbolsInDeck } from '../../layers/studio/src/utils/editor-symbols'

const t = ((key: string) => key) as Parameters<typeof bodySource>[1]

beforeAll(() => registerDeckComponents(SCHEMA_COMPONENTS))
afterAll(() => resetDeckComponents())

// The text once `name` is written at `|` in `doc`.
function write(doc: string, kind: 'icon' | 'pictogram', name: string) {
  const state = EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: doc.indexOf('|') } })
  return state.update(symbolChange(state, kind, name)).state.doc.toString()
}

describe('a symbol written from the view of all the symbols', () => {
  it('goes into the attribute of the component at the caret that takes its kind', () => {
    expect(write('::Step{n="1"| title="Dépôt"}', 'icon', 'home-line')).toBe('::Step{n="1" title="Dépôt" icon="ri:home-line"}')
    expect(write('::Step{n="1" picto="buildings/house"|}', 'pictogram', 'digital/coding')).toBe('::Step{n="1" picto="digital/coding"}')
    expect(write('Voir :i{name="ri:home-line"|}', 'icon', 'user-line')).toBe('Voir :i{name="ri:user-line"}')
  })

  it('goes at the caret as an inline icon or a pictogram image elsewhere', () => {
    expect(write('Voir | ici', 'icon', 'home-line')).toBe('Voir :i{name="ri:home-line"} ici')
    expect(write('|', 'pictogram', 'digital/coding')).toBe('![](/pictograms/digital/coding.svg)')
  })
})

describe('the symbols a deck names', () => {
  it('lists the icons, in either form, and the pictograms once each', () => {
    const deck = '::Step{icon="ri:home-line"}\n::Node{picto="digital/coding"}\n:i{name="ri-user-line"} :i{name="ri:home-line"}\n::Person{name="Lucie"}\n```md\n:i{name="ri:server-line"}\n```'
    expect(symbolsInDeck(deck)).toEqual({ icon: ['home-line', 'user-line'], pictogram: ['digital/coding'] })
  })
})

describe('the completion of a symbol', () => {
  it('opens the view of all the symbols of its kind first', async () => {
    vi.stubGlobal('$fetch', async () => ['digital/coding'])
    const browse = vi.fn()
    const doc = '---\ntheme: dsfr\n---\n::Step{picto="'
    const state = EditorState.create({ doc })
    const result = await bodySource({ lang: 'fr', docsUrl: () => undefined, browseSymbols: browse }, t)(new CompletionContext(state, doc.length, true))
    const first = result!.options[0]!
    expect(first.label).toBe('editor.symbols.browse.pictogram')
    ;(first.apply as () => void)()
    expect(browse).toHaveBeenCalledWith('pictogram')
  })
})
