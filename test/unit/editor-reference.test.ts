/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { MDCNode } from '@nuxtjs/mdc'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { BUILT_IN_COMPONENTS, componentAttributeIssues, DECK_ANNOTATIONS, malformedAttributeMentions, registerDeckComponents, resetDeckComponents, RevealConfigSchema, unclosedBlocks } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, describe, expect, it } from 'vitest'
import { annotationEntries, componentEntries, directiveEntry, DOCS_SECTIONS, docsAddress, FRONTMATTER_KEYS, groupedEntries, SKETCH_FRAME, SLIDE_TEMPLATES } from '../../layers/studio/src/config/editor-reference'
import { slideTemplateFor } from '../../layers/studio/src/utils/editor-commands'
import { references } from '../../site/references'

afterEach(() => resetDeckComponents())

describe('componentEntries', () => {
  it('offers each registered component that has a snippet, in the order of the registry', () => {
    registerDeckComponents(SCHEMA_COMPONENTS)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    const labels = componentEntries('fr').map(entry => entry.syntax)
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
    expect(componentEntries('en').at(-1)).toEqual({ syntax: '::Cover', label: 'Cover', description: 'Cover', icon: 'i-lucide-shapes', snippet: '::Cover\n${Title}\n::' })
  })

  it('falls back to French for a language a component lacks', () => {
    registerDeckComponents([{ name: 'Cover', snippet: { fr: '::Cover\n::' }, description: { fr: 'Couverture' } }])
    expect(componentEntries('en').at(-1)).toEqual({ syntax: '::Cover', label: 'Cover', description: 'Couverture', icon: 'i-lucide-shapes', snippet: '::Cover\n::' })
  })
})

describe('groupedEntries', () => {
  it('lists the groups in their order, the annotations under the slide and the components outside every group last', () => {
    registerDeckComponents(STORYBOOK_COMPONENTS)
    registerDeckComponents([{ name: 'Cover', label: { fr: 'Couverture' }, snippet: { fr: '::Cover\n::' } }])
    const groups = groupedEntries('fr').map(({ group, entries }) => [group, entries.map(entry => entry.label)])
    expect(groups).toEqual([
      ['text', ['Citation', 'Icône', 'Colonnes', 'Message clé', 'Points un par un']],
      ['media', ['Page web', 'Image']],
      ['diagram', ['Schéma Mermaid']],
      ['storybook', ['Écran Storybook', 'Galerie d\'écrans']],
      ['slide', ['Notes de l\'orateur', 'Image de fond', 'Surtitre', 'Sous-titre', 'Mise en page', 'Lien en bas']],
      ['other', ['Couverture']],
    ])
  })
})

describe('directiveEntry', () => {
  it('finds a component by an alias in any case, and a component written inside another', () => {
    expect(directiveEntry(':::', 'columns', 'fr')).toMatchObject({ syntax: ':::columns', label: 'Colonnes', docs: '/reference/nuxt#columns' })
    expect(directiveEntry('::', 'Column', 'fr')).toMatchObject({ label: 'Colonne', docs: '/reference/nuxt#column' })
  })

  it('finds an annotation written with one colon only', () => {
    expect(directiveEntry(':', 'layout', 'en')).toMatchObject({ syntax: ':layout', label: 'Layout' })
    expect(directiveEntry('::', 'layout', 'en')).toBeUndefined()
  })

  it('finds nothing for an unknown name', () => {
    expect(directiveEntry('::', 'Quot', 'fr')).toBeUndefined()
  })
})

describe('docsAddress', () => {
  it('reads a path under the help address of the instance, with or without its trailing slash', () => {
    expect(docsAddress('/reference/nuxt#quote', 'https://docs.example.com')).toBe('https://docs.example.com/reference/nuxt#quote')
    expect(docsAddress('/reference/nuxt#quote', 'https://example.com/docs/')).toBe('https://example.com/docs/reference/nuxt#quote')
    expect(docsAddress('/reference/nuxt#quote', 'https://example.com/docs')).toBe('https://example.com/docs/reference/nuxt#quote')
  })

  it('keeps a full address, and gives none for a path when the instance has no help address', () => {
    expect(docsAddress('https://tenant.example.com/cover', '')).toBe('https://tenant.example.com/cover')
    expect(docsAddress('/reference/nuxt#quote', '')).toBeUndefined()
    expect(docsAddress(undefined, 'https://docs.example.com')).toBeUndefined()
  })
})

// The source of a page of the documentation site: a reference kept beside the
// code, or a file of site/content whose folders and name carry an order prefix.
function pageSource(path: string): string {
  const reference = references.find(entry => entry.path === path)
  if (reference)
    return readFileSync(join(import.meta.dirname, '../..', reference.file), 'utf8')
  let dir = join(import.meta.dirname, '../../site/content')
  const segments = path.split('/').filter(Boolean)
  if (!segments.length)
    return readFileSync(join(dir, 'index.md'), 'utf8')
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1
    const name = readdirSync(dir).find(entry => entry.replace(/^\d+\./, '') === (last ? `${segment}.md` : segment))
    if (!name)
      throw new Error(`no page ${path}`)
    dir = join(dir, name)
  }
  return readFileSync(dir, 'utf8')
}

// The ids MDC gives the headings of a page, which the documentation site renders.
async function anchors(source: string): Promise<string[]> {
  const ids: string[] = []
  const visit = (node: MDCNode) => {
    if (node.type === 'element') {
      if (/^h[1-6]$/.test(node.tag) && typeof node.props?.id === 'string')
        ids.push(node.props.id)
      node.children.forEach(visit)
    }
  }
  ;(await parseMarkdown(source)).body.children.forEach(visit)
  return ids
}

describe('documentation addresses', () => {
  it('point to a heading of a page of the documentation site', async () => {
    const paths = [
      ...[...BUILT_IN_COMPONENTS, ...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS, ...DECK_ANNOTATIONS].flatMap(entry => entry.docs ?? []),
      ...Object.values(DOCS_SECTIONS),
    ]
    for (const docs of paths) {
      const [path, anchor] = docs.split('#')
      const source = pageSource(path!)
      if (anchor)
        expect(await anchors(source), docs).toContain(anchor)
    }
  })
})

describe('annotationEntries', () => {
  it('offers each annotation of the contract under its tag', () => {
    expect(annotationEntries('en').map(entry => entry.syntax)).toEqual(DECK_ANNOTATIONS.map(annotation => `:${annotation.tag}`))
  })
})

describe('frontmatter keys', () => {
  it('offers under `reveal` only options that reach Reveal', () => {
    const offered = FRONTMATTER_KEYS.find(entry => entry.key === 'reveal')!.children!.map(child => child.key)
    expect(offered.filter(key => !Object.hasOwn(RevealConfigSchema.shape, key))).toEqual([])
  })
})

describe('slide templates', () => {
  it('draw their sketch inside the frame of the slide', () => {
    for (const template of SLIDE_TEMPLATES) {
      for (const shape of template.sketch)
        expect(shape.x >= 0 && shape.y >= 0 && shape.x + shape.width <= SKETCH_FRAME.width && shape.y + shape.height <= SKETCH_FRAME.height, template.labelKey).toBe(true)
    }
  })

  it('carry their snippet in French and in English', () => {
    for (const template of SLIDE_TEMPLATES)
      expect(Object.keys(template.snippet).sort(), template.labelKey).toEqual(['en', 'fr'])
  })
})

describe('authoring texts of the packages', () => {
  it('carries each name, snippet and description in French and in English', () => {
    const entries = [...DECK_ANNOTATIONS, ...[...BUILT_IN_COMPONENTS, ...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS].filter(c => c.snippet)]
    for (const entry of entries) {
      expect(Object.keys(entry.snippet ?? {}).sort(), JSON.stringify(entry.snippet)).toEqual(['en', 'fr'])
      expect(Object.keys(entry.description ?? {}).sort(), JSON.stringify(entry.description)).toEqual(['en', 'fr'])
      expect(Object.keys(entry.label ?? {}).sort(), JSON.stringify(entry.label ?? entry)).toEqual(['en', 'fr'])
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

  it('insert a text the editor reads without an issue, in both languages', () => {
    registerDeckComponents(SCHEMA_COMPONENTS)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    for (const lang of ['fr', 'en']) {
      const snippets = [
        ...componentEntries(lang),
        ...annotationEntries(lang),
        ...SLIDE_TEMPLATES.map(template => ({ label: template.labelKey, snippet: template.snippet[lang as 'fr']! })),
      ]
      for (const { label, snippet } of snippets) {
        const text = snippet.replace(/\$\{(?:\d+:)?([^}]*)\}/g, '$1')
        expect([...malformedAttributeMentions(text), ...unclosedBlocks(text), ...componentAttributeIssues(text)], `${lang} ${label}`).toEqual([])
      }
    }
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
