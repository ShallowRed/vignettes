import { describe, expect, it } from 'vitest'
import { parsedTitleSlide, readTitleSlide, titleSlidePreview } from '../../layers/studio/shared/presentations/title-slide'

describe('readTitleSlide', () => {
  it('reads the title, the annotations and the backgrounds of a separator deck', () => {
    const raw = [
      '---',
      'title: Deck',
      'parser: separator',
      'backgrounds:',
      '  h1: /backgrounds/title.png',
      '---',
      '',
      '# Un **registre** public',
      ':pretitle{text="Atelier"}',
      ':subtitle{text=\'Septembre 2026\'}',
      '',
      '---',
      '',
      '## Second slide',
    ].join('\n')
    expect(readTitleSlide(raw)).toEqual({
      title: 'Un registre public',
      pretitle: 'Atelier',
      subtitle: 'Septembre 2026',
      headingLevel: 'h1',
      backgroundImage: undefined,
      backgrounds: { h1: '/backgrounds/title.png' },
    })
  })

  it('stops at the first slide of a heading deck and keeps its own background', () => {
    const raw = [
      '---',
      'parser: heading',
      '---',
      '',
      '# Démonstration',
      ':slide-background{image="/images/cover.png"}',
      '',
      '## Texte',
      ':pretitle{text="Not the first slide"}',
    ].join('\n')
    expect(readTitleSlide(raw)).toMatchObject({
      title: 'Démonstration',
      pretitle: undefined,
      backgroundImage: '/images/cover.png',
    })
  })

  it('reads the first paragraph as the subtitle when the slide declares none', () => {
    const raw = '---\nparser: separator\n---\n\n## What we have built\n\nThe metadata of a rule is a file.\n\n----\n\n### Next'
    expect(readTitleSlide(raw)).toMatchObject({ title: 'What we have built', subtitle: 'The metadata of a rule is a file.', headingLevel: 'h2' })
  })

  it('does not take a slide separator for a subtitle', () => {
    const raw = '---\nparser: separator\n---\n\n# Title only\n\n---\n\n## Next'
    expect(readTitleSlide(raw).subtitle).toBeUndefined()
  })

  it('ignores headings inside fenced code', () => {
    const raw = '```md\n# Not a title\n```\n\n# Real title'
    expect(readTitleSlide(raw).title).toBe('Real title')
  })
})

describe('parsedTitleSlide', () => {
  const text = (value: string) => ({ type: 'text', value })
  const element = (tag: string, ...children: unknown[]) => ({ type: 'element', tag, children })

  it('reads the title, the pretitle and the first paragraph of the first slide with a heading', () => {
    const slides = [
      { body: { type: 'root', children: [element('p', text('Avant le titre'))] } },
      {
        header: { type: 'root', children: [element('h1', text('Un '), element('strong', text('registre')), text(' public'))] },
        pretitle: { type: 'root', children: [element('p', text('Atelier'))] },
        body: { type: 'root', children: [element('ul'), element('p', text('Le bilan de septembre.'))] },
        headingLevel: 'h1',
      },
    ]
    expect(parsedTitleSlide(slides, { h1: '/backgrounds/title.png' })).toEqual({
      title: 'Un registre public',
      pretitle: 'Atelier',
      subtitle: 'Le bilan de septembre.',
      headingLevel: 'h1',
      backgroundImage: undefined,
      backgrounds: { h1: '/backgrounds/title.png' },
    })
  })
})

describe('titleSlidePreview', () => {
  const backgrounds = 'backgrounds:\n  h1: /title.png\n  h2: /section.png\n  h3: /content.png'

  it('gives a ## title slide the section surface or the content surface', () => {
    const section = readTitleSlide(`---\n${backgrounds}\n---\n\n## Part one\n\nWhat this part covers.`)
    const content = readTitleSlide(`---\n${backgrounds}\n---\n\n## Part one\n\n- A point\n- Another point`)
    expect(section.section).toBe(true)
    expect(titleSlidePreview(section, 'minimal')).toMatchObject({ surface: 'h2', background: '/section.png' })
    expect(titleSlidePreview(content, 'minimal')).toMatchObject({ surface: 'h3', background: '/content.png' })
  })

  it('keeps the base colors and the title background for a deck without a heading', () => {
    const preview = titleSlidePreview(readTitleSlide(`---\n${backgrounds}\n---\n\nSome text.`), 'minimal')
    expect(preview.surface).toBeUndefined()
    expect(preview.background).toBe('/title.png')
  })

  it('carries the deck\'s bloc marque, and none without a brand', () => {
    const branded = readTitleSlide('---\nbrand:\n  ministry: [Ministère, des Armées]\n---\n\n# Bilan')
    expect(titleSlidePreview(branded, 'dsfr').brand).toMatchObject({ lines: ['Ministère', 'des Armées'] })
    expect(titleSlidePreview(readTitleSlide('# Bilan'), 'dsfr').brand).toBeUndefined()
  })
})
