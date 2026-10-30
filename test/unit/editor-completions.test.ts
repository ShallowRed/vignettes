import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { bodySource, hintAt } from '../../layers/studio/src/utils/editor-completions'
import { frontmatterGuide } from '../../layers/studio/src/utils/editor-frontmatter'

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

describe('attribute completion cases', () => {
  // The completion with the caret at `|` in `doc`.
  function at(doc: string) {
    const pos = doc.indexOf('|')
    return source(new CompletionContext(EditorState.create({ doc: doc.replace('|', '') }), pos, true))
  }

  it('leaves out an attribute written after the caret', () => {
    expect(at('::Fragments{| dim}')?.options.map(option => option.label)).toEqual(['effect', 'collapse'])
  })

  it('brings the quotes of a value written after `=`', () => {
    expect(at(':::Columns{size=|')?.options.slice(0, 2).map(option => option.apply)).toEqual(['"xs"', '"sm"'])
  })

  it('offers the attributes of an annotation', () => {
    expect(at(':quicklink{text="Voir" |')?.options.map(option => option.label)).toEqual(['href'])
  })

  it('offers the attributes of `:layout` but those written, and their closed values', () => {
    const labels = at(':layout{media="right" | src="/a.png"}')?.options.map(option => option.label)
    expect(labels).toContain('lightbox')
    expect(labels).not.toContain('media')
    expect(labels).not.toContain('src')
    expect(at(':layout{media="|"}')?.options.map(option => option.label)).toEqual(['right', 'left', 'top', 'bottom', 'behind'])
  })

  it('offers the attributes written as YAML under a component, and their values', () => {
    expect(at(':::Columns\n---\n|\n---')?.options.map(option => option.apply)).toEqual(['size: '])
    expect(at(':::Columns\n---\nsize: |\n---')?.options.map(option => option.label)).toEqual(['xs', 'sm', 'md', 'lg', 'xl'])
  })
})

describe('component list', () => {
  const labels = (doc: string) => source(new CompletionContext(EditorState.create({ doc }), doc.length, true))?.options.map(option => option.label) ?? []

  it('offers inside a component the components written in it, and those only', () => {
    expect(labels(':::Columns\n::')).toEqual(['::Column'])
  })

  it('offers the annotations on a lone colon at the start of a line, and nothing on a colon in a sentence', () => {
    expect(labels('# Slide\n\n:')).toEqual(expect.arrayContaining([':pretitle', ':layout', ':i']))
    expect(labels('# Slide\n\n:')).not.toContain(':::Columns')
    expect(source(new CompletionContext(EditorState.create({ doc: 'Le constat :' }), 12, false))).toBeNull()
  })

  it('leaves the components written inside another out of the list elsewhere', () => {
    expect(labels('# Slide\n\n::')).not.toContain('::Column')
    expect(labels(':::Columns\n::Column\nText\n::\n:::\n\n::')).not.toContain('::Column')
  })
})

describe('completion hint', () => {
  const sources = { frontmatter: frontmatterGuide({ lang: 'fr', t, docsUrl: () => undefined }).source, body: source }

  // The hint with the caret at `|` in `doc`.
  function hint(doc: string) {
    const at = doc.indexOf('|')
    return hintAt(EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: at } }), sources)
  }

  it('shows where the suggestions or the slash menu have something to offer', () => {
    expect(hint('---\ntitle: Deck\n|\n---\n')).toEqual({ kind: 'settings' })
    expect(hint('---\nsyntax:\n  split:|\n---\n')).toEqual({ kind: 'values' })
    expect(hint('# Slide\n\n:::Columns{|}')).toEqual({ kind: 'attributes' })
    expect(hint('# Slide\n\n:::Columns{size="|"}')).toEqual({ kind: 'values' })
    expect(hint('# Slide\n\n|')).toEqual({ kind: 'insert' })
  })

  it('describes a free value of the frontmatter', () => {
    expect(hint('---\nstorybook: |\n---\n')).toMatchObject({ kind: 'free', key: { key: 'storybook' } })
    expect(hint('---\nreveal:|\n---\n')).toBeNull()
  })

  it('stays quiet in a word, in code and where nothing is offered', () => {
    expect(hint(':::Columns{si|')).toBeNull()
    expect(hint('::Fragments{effect="|"}')).toBeNull()
    expect(hint('```md\n|\n```')).toBeNull()
    expect(hint('````md\n```\n|\n````')).toBeNull()
    expect(hint('Some text|')).toBeNull()
  })
})

describe('frontmatter value completion', () => {
  it('offers the values of an empty key, with the space YAML needs after the colon', () => {
    const doc = '---\nsyntax:\n  split:'
    const result = frontmatterGuide({ lang: 'fr', t, docsUrl: () => undefined }).source(new CompletionContext(EditorState.create({ doc }), doc.length, true))
    expect(result?.options.map(option => [option.label, option.apply])).toEqual([['separator', ' separator'], ['heading', ' heading']])
  })
})
