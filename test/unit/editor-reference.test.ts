/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import { BUILT_IN_COMPONENTS, DECK_ANNOTATIONS, registerDeckComponents, resetDeckComponents, RevealConfigSchema, unclosedBlocks } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, describe, expect, it } from 'vitest'
import { annotationEntries, componentEntries, FRONTMATTER_KEYS, SLIDE_TEMPLATES } from '../../layers/studio/src/config/editor-reference'
import { slideTemplateFor } from '../../layers/studio/src/utils/editor-commands'

afterEach(() => resetDeckComponents())

describe('componentEntries', () => {
  it('offers each registered component that has a snippet, in the order of the registry', () => {
    registerDeckComponents(SCHEMA_COMPONENTS)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    const labels = componentEntries('fr').map(entry => entry.label)
    expect(labels).toEqual([
      '::Quote',
      '::Iframe',
      '::Image',
      '::Mermaid',
      ':i',
      ':::Columns',
      '::Highlight',
      '::Notes',
      '::Fragments',
      ':::Scheme',
      ':::Diagram',
      ':::JsonTour',
      '::StoryFrame',
      ':::Screens',
    ])
  })

  it('offers a component the application registers, with its texts in the interface language', () => {
    registerDeckComponents([{ name: 'Cover', snippet: { fr: '::Cover\n${Titre}\n::', en: '::Cover\n${Title}\n::' }, description: { fr: 'Couverture', en: 'Cover' } }])
    expect(componentEntries('en').at(-1)).toEqual({ label: '::Cover', description: 'Cover', snippet: '::Cover\n${Title}\n::' })
  })

  it('falls back to French for a language a component lacks', () => {
    registerDeckComponents([{ name: 'Cover', snippet: { fr: '::Cover\n::' }, description: { fr: 'Couverture' } }])
    expect(componentEntries('en').at(-1)).toEqual({ label: '::Cover', description: 'Couverture', snippet: '::Cover\n::' })
  })
})

describe('annotationEntries', () => {
  it('offers each annotation of the contract under its tag', () => {
    expect(annotationEntries('en').map(entry => entry.label)).toEqual(DECK_ANNOTATIONS.map(annotation => `:${annotation.tag}`))
  })
})

describe('frontmatter keys', () => {
  it('offers under `reveal` only options that reach Reveal', () => {
    const offered = FRONTMATTER_KEYS.find(entry => entry.key === 'reveal')!.children!.map(child => child.key)
    expect(offered.filter(key => !Object.hasOwn(RevealConfigSchema.shape, key))).toEqual([])
  })
})

describe('slide templates', () => {
  it('carry their snippet in French and in English', () => {
    for (const template of SLIDE_TEMPLATES)
      expect(Object.keys(template.snippet).sort(), template.labelKey).toEqual(['en', 'fr'])
  })
})

describe('authoring texts of the packages', () => {
  it('carries each snippet and description in French and in English', () => {
    const entries = [...DECK_ANNOTATIONS, ...[...BUILT_IN_COMPONENTS, ...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS].filter(c => c.snippet)]
    for (const entry of entries) {
      expect(Object.keys(entry.snippet ?? {}).sort(), JSON.stringify(entry.snippet)).toEqual(['en', 'fr'])
      expect(Object.keys(entry.description ?? {}).sort(), JSON.stringify(entry.description)).toEqual(['en', 'fr'])
    }
  })
})

describe('snippets', () => {
  it('write numbers as text: a numeric `${…}` is an empty tab stop', () => {
    registerDeckComponents(SCHEMA_COMPONENTS)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    const snippets = [
      ...componentEntries('fr'),
      ...annotationEntries('fr'),
      ...SLIDE_TEMPLATES.map(template => ({ label: template.labelKey, snippet: template.snippet.fr! })),
      ...FRONTMATTER_KEYS.filter(key => key.snippet).map(key => ({ label: key.key, snippet: typeof key.snippet === 'string' ? key.snippet : key.snippet.fr! })),
    ]
    expect(snippets.filter(entry => /\$\{\d+\}/.test(entry.snippet)).map(entry => entry.label)).toEqual([])
  })

  it('close each block a slide template opens', () => {
    for (const template of SLIDE_TEMPLATES)
      expect(unclosedBlocks(template.snippet.fr!), template.labelKey).toEqual([])
  })
})

describe('slideTemplateFor', () => {
  const template = '---\n\n## ${Titre}\n\nTexte.'

  it('drops the leading break when headings split the deck', () => {
    expect(slideTemplateFor(template, 'heading')).toBe('## ${Titre}\n\nTexte.')
  })

  it('writes a content slide with ### when breaks split the deck, and keeps a section', () => {
    expect(slideTemplateFor(template, 'separator')).toBe('---\n\n### ${Titre}\n\nTexte.')
    expect(slideTemplateFor(template, 'separator', true)).toBe(template)
  })
})
