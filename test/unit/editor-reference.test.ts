/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import { BUILT_IN_COMPONENTS, DECK_ANNOTATIONS, registerDeckComponents, resetDeckComponents, RevealConfigSchema } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, describe, expect, it } from 'vitest'
import { annotationEntries, componentEntries, FRONTMATTER_KEYS, SLIDE_TEMPLATES } from '../../layers/studio/src/config/editor-reference'

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
