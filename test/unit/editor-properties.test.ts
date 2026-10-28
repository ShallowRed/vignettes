import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { attributeChange, attributeValue, componentAt } from '../../layers/studio/src/utils/editor-properties'

// The state with the caret at `|` in `doc`.
function at(doc: string) {
  return EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: doc.indexOf('|') } })
}

// The text after setting `name` of the component under the caret to `value`.
function set(doc: string, name: string, value: string) {
  const state = at(doc)
  const attribute = componentAt(state)!.directive.attributes!.find(candidate => candidate.name === name)!
  return state.update(attributeChange(state, attribute, value)).state.doc.toString()
}

describe('componentAt', () => {
  it('reads the component on the caret line, then the block around the caret', () => {
    expect(componentAt(at('::Fragments{dim}|\n- a\n::'))?.syntax).toBe('::Fragments')
    expect(componentAt(at(':::Columns{size="lg"}\nText|\n:::'))?.syntax).toBe(':::Columns')
    expect(componentAt(at('Plain text|'))).toBeUndefined()
    expect(componentAt(at(':layout{media="right"}|'))).toBeUndefined()
  })

  it('leaves a component written in fenced code', () => {
    expect(componentAt(at('```md\n::Fragments{dim}|\n::\n```'))).toBeUndefined()
  })

  it('reads the values a component gets, its defaults included', () => {
    const component = componentAt(at('::Fragments{dim effect="grow"}|\n::'))!
    const value = (name: string) => attributeValue(component, component.directive.attributes!.find(attribute => attribute.name === name)!)
    expect([value('dim'), value('effect'), value('collapse')]).toEqual(['true', 'grow', 'false'])
  })
})

describe('attributeChange', () => {
  it('writes a value, a flag and a false value against a true default', () => {
    expect(set('::Fragments|\n::', 'effect', 'grow')).toBe('::Fragments{effect="grow"}\n::')
    expect(set('::Fragments{effect="grow"}|\n::', 'dim', 'true')).toBe('::Fragments{effect="grow" dim}\n::')
    expect(set(':::Columns|\n:::', 'size', 'lg')).toBe(':::Columns{size="lg"}\n:::')
  })

  it('removes an attribute set back to its default, and the braces left empty', () => {
    expect(set('::Fragments{dim effect="grow"}|\n::', 'dim', 'false')).toBe('::Fragments{effect="grow"}\n::')
    expect(set('::Fragments{effect="grow"}|\n::', 'effect', 'fade-in')).toBe('::Fragments\n::')
  })

  it('writes a value holding quotes so that it reads back the same', () => {
    for (const value of ['Dire "oui"', 'L\'avis "net"']) {
      const component = componentAt(at(`${set(':quicklink|', 'text', value)}|`))!
      expect(attributeValue(component, component.directive.attributes!.find(attribute => attribute.name === 'text')!)).toBe(value)
    }
  })

  it('keeps the attributes the component does not declare', () => {
    expect(set(':quicklink{.big text="Voir"}|', 'href', '/demo')).toBe(':quicklink{.big text="Voir" href="/demo"}')
  })
})
