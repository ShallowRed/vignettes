import { describe, expect, it } from 'vitest'
import { readTitleSlide } from '../../layers/studio/shared/presentations/title-slide'

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
