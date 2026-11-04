import { attributeMentions, blockEndAround, bodyMedia, componentAttributeIssues, componentMentions, containerPrefix, directiveMentions, escapeBlockStart, escapeHeadingClose, headingTextRange, isSectionSlide, listItemTextStart, malformedAttributeMentions, opensBlock, registerDeckComponents, resetDeckComponents, slideSourceAt, splitSlides, unclosedBlocks } from '@vignettes/core/deck'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterEach, describe, expect, it } from 'vitest'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

function positions(raw: string, parser: 'heading' | 'separator') {
  return splitSlides(raw, parser).map(({ startLine, h, v }) => `${startLine}:${h}.${v}`)
}

describe('splitSlides, heading decks', () => {
  it('keeps a thematic break inside the title slide', () => {
    expect(positions('# T\n\ntext\n\n---\n\nmore\n\n## A\n\nx', 'heading')).toEqual(['1:0.0', '9:1.0'])
  })

  it('opens a slide on a thematic break outside the title slide, spaced ones included', () => {
    expect(positions('## A\n\na\n\n* * *\n\nb\n\n___\n\nc', 'heading')).toEqual(['1:0.0', '5:1.0', '9:2.0'])
  })

  it('reads fenced code and MDC blocks as content', () => {
    expect(positions('## A\n\n```\n## not\n---\n```\n\n## B', 'heading')).toEqual(['1:0.0', '8:1.0'])
    expect(positions('::FullScreenImage{src="/bg.png"}\n# Title\n::\n\n## Next', 'heading')).toEqual(['1:0.0', '5:1.0'])
    expect(positions(':::Screens\n::StoryFrame{story="x"}\n::\n## inside\n:::\n\n## B', 'heading')).toEqual(['1:0.0', '7:1.0'])
  })

  it('lifts the paragraph of a setext heading', () => {
    expect(positions('## A\n\ntext\n\nPara\n---\n\nafter', 'heading')).toEqual(['1:0.0', '5:1.0'])
    expect(positions('Para\n---\n\ntext', 'heading')).toEqual(['1:0.0'])
  })

  it('stacks a `###` unless it opens its section', () => {
    expect(positions('## A\n\n### v1\n\ntext\n\n### v2\n\n## B\n\n### only', 'heading'))
      .toEqual(['1:0.0', '3:0.1', '7:0.2', '9:1.0', '11:1.1'])
  })

  it('starts after the frontmatter and returns nothing for an empty deck', () => {
    expect(positions('---\ntitle: x\n---\n\n# T\n\n## A', 'heading')).toEqual(['5:0.0', '7:1.0'])
    expect(splitSlides('', 'heading')).toEqual([])
  })
})

describe('splitSlides, separator decks', () => {
  it('splits on `---` and stacks on `----`, outside fenced code', () => {
    expect(positions('a\n---\nb\n----\nc\n---\n```\n---\n```\nd', 'separator')).toEqual(['1:0.0', '3:1.0', '5:1.1', '7:2.0'])
  })

  it('keeps the separators out of the slides', () => {
    expect(splitSlides('a\n---\nb', 'separator').map(s => s.text)).toEqual(['a', 'b'])
  })
})

describe('parsed slides', () => {
  it('keeps a thematic break and the fenced code of the slide it opens', async () => {
    const [, slide] = await PARSERS.heading.parse('## A\n\ntext\n\n---\n\n```\na\n---\n```', {} as any)
    const children = (slide!.body as any).children
    expect(children.map((node: any) => node.tag)).toEqual(['hr', 'pre'])
    expect(children[1].props.code).toBe('a\n---\n')
  })

  it('resolves a link reference defined on another slide of a heading deck', async () => {
    const [slide] = await PARSERS.heading.parse('## A\n\n[x][ref]\n\n## B\n\n[ref]: https://e.x', {} as any)
    const link = (slide!.body as any).children[0].children[0]
    expect(link.tag).toBe('a')
    expect(link.props.href).toBe('https://e.x')
  })

  it('keeps fenced code whole in a separator deck', async () => {
    const slides = await PARSERS.separator.parse('a\n---\n```\nb\n---\nc\n```', {} as any)
    expect(slides).toHaveLength(2)
    expect((slides[1]!.body as any).children[0].props.code).toBe('b\n---\nc\n')
  })
})

describe('componentMentions', () => {
  it('places each mention by line and column, names compared without case and hyphens', () => {
    const raw = '# Title\n\n::callout\ntext\n::\n\nSee :Call-out{a="b"} here'
    expect(componentMentions(raw, ['Callout'])).toEqual([
      { name: 'callout', line: 3, column: 0, length: 9 },
      { name: 'Call-out', line: 7, column: 4, length: 9 },
    ])
  })

  it('leaves out the frontmatter, fenced code and inline code', () => {
    const raw = '---\ntitle: ":Callout"\n---\n\n```md\n::Callout\n```\n\nWrite `::Callout` to\n\n::Callout\n::'
    expect(componentMentions(raw, ['Callout']).map(mention => mention.line)).toEqual([11])
  })
})

describe('directiveMentions', () => {
  it('places every directive with its colons, outside the frontmatter and code, and after no letter', () => {
    const raw = '---\ntitle: ":pretitle"\n---\n\n::::Columns\n:pretitle{text="a"} `::Quote` été:subtitle{text="b"}\n```\n::Quote\n```'
    expect(directiveMentions(raw)).toEqual([
      { name: 'Columns', colons: '::::', line: 5, column: 0, length: 11 },
      { name: 'pretitle', colons: ':', line: 6, column: 0, length: 9, attributes: { from: 9, to: 19 } },
    ])
  })
})

describe('attributeMentions', () => {
  it('places each refused address and binding by line and column', () => {
    const raw = [
      '# Title',
      '::Iframe{src="javascript:alert(1)" title="t"}',
      '[a](javascript:alert(2)) ![b](/b.png) [c]{:href="storybook"}',
      ':layout{name="media-right" :src=\'"data:text/html,x"\'}',
      '::Image{src="data:image/png;base64,AA" :preview="true"}',
      '::Iframe{:src=\'"javascript:alert(\\\'x\\\')"\'}',
    ].join('\n')
    const found = attributeMentions(raw).map(({ line, column, length, reason }) => [line, raw.split('\n')[line - 1]!.slice(column, column + length), reason])
    expect(found).toEqual([
      [2, 'src="javascript:alert(1)"', 'url'],
      [3, ':href="storybook"', 'binding'],
      [3, 'javascript:alert(2)', 'url'],
      [4, ':src=\'"data:text/html,x"\'', 'url'],
      [6, ':src=\'"javascript:alert(\\\'x\\\')"\'', 'url'],
    ])
  })

  it('places an http address the page does not load, and leaves an http link', () => {
    const raw = '::Iframe{src="http://example.com" title="t"}\n![a](http://example.com/a.png) [b](http://example.com)\n::Iframe{src="http://localhost:6006"}'
    const found = attributeMentions(raw).map(({ line, reason }) => [line, reason])
    expect(found).toEqual([[1, 'http'], [2, 'http']])
  })

  it('leaves out the frontmatter and fenced code', () => {
    const raw = '---\nstorybook: javascript:x\n---\n\n```md\n::Iframe{src="javascript:x"}\n```\n'
    expect(attributeMentions(raw)).toEqual([])
  })
})

describe('componentAttributeIssues', () => {
  it('places an unknown attribute and "false" written as a text', () => {
    const raw = [
      '# Title',
      '::Fragments{dim="false" efect="grow" collapse .big class="x" data-id="a"}',
      '::Fragments{:dim="false" effect="fade-up"}',
      ':::Columns{size="lg"}',
      '::Foo{bar="1"}',
      ':layout{zz="1"}',
    ].join('\n')
    const found = componentAttributeIssues(raw).map(({ kind, component, line, column, length }) => [kind, component, line, raw.split('\n')[line - 1]!.slice(column, column + length)])
    expect(found).toEqual([
      ['false-text', 'Fragments', 2, 'dim="false"'],
      ['unknown', 'Fragments', 2, 'efect="grow"'],
    ])
  })
})

describe('splitSlides, a setext underline after another block', () => {
  it('keeps a thematic break under an html block tag', () => {
    expect(positions('## A\n\n<div>Block</div>\n---\n\n## B', 'heading')).toEqual(['1:0.0', '4:1.0', '6:2.0'])
  })

  it('lifts a line in italics into a setext heading', () => {
    expect(positions('# T\n\n*A line*\n---\n\nx', 'heading')).toEqual(['1:0.0', '3:1.0'])
  })
})

describe('isSectionSlide', () => {
  const sections = (raw: string, parser: 'heading' | 'separator') =>
    splitSlides(raw, parser).map(slide => isSectionSlide(slide.text))

  it.each([
    ['a heading alone', '## Part one'],
    ['a heading and one line', '## Part one\n\nWhat this part covers.'],
    ['a heading and one paragraph on two lines', '## Part one\n\nWhat this part\ncovers.'],
    ['a line in italics', '## Part one\n\n*A line in italics.*'],
    ['a line in bold', '## Part one\n\n**A line in bold.**'],
    ['a line that opens with an inline component', '## Part one\n\n:i{name="ri:heart-line"} Merci'],
    ['a line that opens with a number', '## Part one\n\n2026, the year in review'],
    ['a line that opens with an inline tag', '## Part one\n\n<abbr title="Interface">API</abbr> en bref'],
    ['an html comment', '## Part one\n\n<!-- to rewrite -->\n\nOne line.'],
    ['speaker notes and annotations', '## Part one\n\n:pretitle{text="Chapter"}\n\n::Notes\nWhat to say.\n\nMore to say.\n::'],
    ['a setext heading', 'Part one\n--------\n\nOne line.'],
    ['a short line whose link target is long', `## Part one\n\n[Read the guide of the procedure.](https://example.com/${'a'.repeat(120)})`],
  ])('reads %s as a section', (_, text) => {
    expect(isSectionSlide(text)).toBe(true)
  })

  it.each([
    ['two paragraphs', '## Part one\n\nThe first line.\n\nThe second line.'],
    ['a paragraph longer than 140 characters', `## Part one\n\n${'word '.repeat(30)}`],
    ['a list', '## Part one\n\n- One point'],
    ['a numbered list', '## Part one\n\n1. One point'],
    ['a quote', '## Part one\n\n> A quote'],
    ['an image alone', '## Part one\n\n![A photo](/a.png)'],
    ['a component alone', '## Part one\n\n:StoryFrame{story="a--b"}'],
    ['a block component', '## Part one\n\n::Highlight\nKey message.\n::'],
    ['a layout', '## Part one\n\n:layout{name="media-right" src="/a.png"}'],
    ['a ### heading', '### Alone'],
    ['a # heading', '# Title'],
  ])('reads %s as a content slide', (_, text) => {
    expect(isSectionSlide(text)).toBe(false)
  })

  it('reads the displayed text of a long paragraph', () => {
    expect(isSectionSlide(`## Part one\n\n[${'word '.repeat(30)}](/a)`)).toBe(false)
  })

  it('applies to the slides of both parsers', () => {
    const body = '## Part one\n\nOne line.\n\n### A point\n\nSome text.'
    expect(sections(`# Title\n\n${body}`, 'heading')).toEqual([false, true, false])
    expect(sections(`# Title\n\n---\n\n## Part one\n\nOne line.\n\n---\n\n## A list\n\n- One point`, 'separator')).toEqual([false, true, false])
  })
})

describe('unclosedBlocks', () => {
  it('lists the blocks no closing line ends, outside fenced code', () => {
    const raw = '---\ntitle: T\n---\n### Citation\n\n::Quote{author="A"}\nTexte.\n\n---\n\n### Suite\n\n```md\n::Columns\n```\n'
    expect(unclosedBlocks(raw)).toEqual([{ name: 'Quote', colons: '::', line: 6, column: 0, length: 7 }])
  })

  it('lists none when each block is closed, nested blocks included', () => {
    expect(unclosedBlocks(':::Columns\n::Column\nA\n::\n::Column\nB\n::\n:::\n')).toEqual([])
  })
})

describe('blockEndAround', () => {
  const raw = '### Citation\n\n::Quote{author="A"}\nTexte.\n::\n\n### Colonnes\n\n:::Columns\n::Column\nA\n::\n:::\n'

  it('gives the line that closes the outermost block around the caret', () => {
    expect(blockEndAround(raw, 3)).toBe(5)
    expect(blockEndAround(raw, 11)).toBe(13)
  })

  it('gives nothing outside a block, and the last line in a block left open', () => {
    expect(blockEndAround(raw, 1)).toBeUndefined()
    expect(blockEndAround('::Notes\nA\nB', 2)).toBe(3)
  })
})

describe('malformedAttributeMentions', () => {
  it('marks a missing brace, a missing quote and a value between typographic quotes', () => {
    const raw = ':subtitle{text="Sous-titre"\n\n::Quote{author="Jean}\n::\n\n::Quote{author=«Une usagère»}\n::\n'
    expect(malformedAttributeMentions(raw).map(({ name, reason, line }) => [name, reason, line])).toEqual([
      ['subtitle', 'brace', 1],
      ['Quote', 'quote', 3],
      ['Quote', 'typographic', 6],
    ])
  })

  it('leaves well-written attributes, flags, unquoted values and quoted braces or typographic quotes', () => {
    const raw = ':::Screens{cols=3 lightbox}\n::StoryFrame{story="a--b" lightbox}\n::\n:::\n:i{name="ri:home-line"}\n:pretitle{text="Le « dossier » unique"}\n:quicklink{text="a}b" href="https://example.com"}'
    expect(malformedAttributeMentions(raw)).toEqual([])
  })
})

describe('bodyMedia', () => {
  afterEach(() => resetDeckComponents())

  const slide = (...lines: string[]) => ['## Une diapositive', '', 'Un texte.', '', ...lines].join('\n')

  it('reads a markdown image and an image block alone in the body, with their lines', () => {
    expect(bodyMedia(slide('![Une vue](/images/a.png)'))).toEqual([
      { component: 'image', attributes: { src: '/images/a.png', alt: 'Une vue' }, from: 5, to: 5, movable: true },
    ])
    expect(bodyMedia(slide('::Image{src="/a.png" alt="Une vue"}', '::'))).toEqual([
      { component: 'Image', attributes: { src: '/a.png', alt: 'Une vue' }, from: 5, to: 6, movable: true },
    ])
  })

  it('leaves a media written inside another component, a list, a paragraph or the code', () => {
    expect(bodyMedia(slide('::Columns', ':::Column', '![x](/b.png)', ':::', '::'))).toEqual([])
    expect(bodyMedia(slide('```md', '![x](/b.png)', '```'))).toEqual([])
    expect(bodyMedia(slide('- Un point', '  ![x](/b.png)'))).toEqual([])
    expect(bodyMedia(['## Une diapositive', '', 'Un texte.', '![x](/b.png)'].join('\n'))).toEqual([])
    expect(bodyMedia(slide('    ![x](/b.png)'))).toEqual([])
    expect(bodyMedia(slide('![x](/b.png)', 'La suite du texte.'))).toEqual([])
    expect(bodyMedia(['## Une diapositive', '', 'Un texte.', ':Image{src="/a.png"}'].join('\n'))).toEqual([])
  })

  it('reads an image right under the heading or after the end of a block', () => {
    expect(bodyMedia('## Une diapositive\n![x](/b.png)\n').map(media => media.from)).toEqual([2])
    expect(bodyMedia(slide('::Notes', 'Une note.', '::', '![x](/b.png)')).map(media => media.from)).toEqual([8])
  })

  it('keeps in place a media that :layout cannot show as its component does', () => {
    const movable = (text: string) => bodyMedia(text).map(media => media.movable)
    expect(movable(slide('![x](/b.png "Un titre")'))).toEqual([false])
    expect(movable(slide('::Image{src="/a.png"}', 'Une légende', '::'))).toEqual([false])
    expect(movable(slide('::Image{src="/a.png" rounded}', '::'))).toEqual([false])
    expect(movable(slide('::Image{src="/a.png" fit="fill"}', '::'))).toEqual([false])
    expect(movable(slide('::Image[Une légende]{src="/a.png"}', '::'))).toEqual([false])
    expect(movable(slide('![x](/a.png){.rounded}'))).toEqual([false])
    expect(movable(slide('![x](/a.png)', '', '![y](/b.png)'))).toEqual([false, false])
    expect(movable(slide('![x](/a.png){.rounded}', '', '![y](/b.png)'))).toEqual([false, false])
  })

  it('counts a story as a media once the extension registers its components', () => {
    registerDeckComponents(STORYBOOK_COMPONENTS)
    expect(bodyMedia(slide('::StoryFrame{story="page--home" lightbox}', '::'))).toEqual([
      { component: 'StoryFrame', attributes: { story: 'page--home', lightbox: true }, from: 5, to: 6, movable: true },
    ])
    expect(bodyMedia(slide('::StoryFrame{story="page--home" label="Accueil"}', '::')).map(media => media.movable)).toEqual([false])
    expect(bodyMedia(slide('![x](/a.png)', '', '::StoryFrame{story="page--home"}', '::')).map(media => media.movable)).toEqual([false, false])
  })
})

describe('slideSourceAt', () => {
  it('places the text of a slide in its deck', () => {
    const raw = '---\ntitle: T\n---\n\n## A\n\na\n\n## B\n\n### C\n\nc\n'
    for (const [h, v] of [[0, 0], [1, 0], [1, 1]]) {
      const slide = slideSourceAt(raw, 'heading', h!, v!)!
      expect(raw.slice(slide.from, slide.from + slide.text.length)).toBe(slide.text)
    }
    expect(slideSourceAt(raw, 'heading', 1, 1)!.text.startsWith('### C')).toBe(true)
    expect(slideSourceAt(raw, 'heading', 2, 0)).toBeUndefined()
  })

  it('places the slides of a separator deck after their separator line', () => {
    const raw = 'A\n\n---\n\nB\n\n----\n\nC'
    expect(slideSourceAt(raw, 'separator', 1, 1)).toEqual({ from: raw.indexOf('\n\nC') + 1, text: '\nC' })
  })
})

describe('opensBlock and escapeBlockStart', () => {
  const OPENING = ['## x', '# x', '---', '===', '***', '- x', '+ x', '* x', '1. x', '2) x', '> x', '| a |', '--|--', '| :-- | --: |', '-:', ':-:', ':--', '```', '~~~ js', '::Nom', ':::Nom{a="b"}', '::', ':Nom', ':icon{name="x"}', ':Nom[x]', '<!-- x', '<div>', '<style>p{}', '<script', '<center>x', '</summary>', '<?x', '<!DOCTYPE', '<![CDATA[', '<span>', '[a]: /b', '[^1]: note']

  it('knows the lines that open a block', () => {
    for (const line of OPENING)
      expect(opensBlock(line), line).toBe(true)
    for (const line of ['texte', 'Bilan : fin', '2026 en bref', '<kbd>Ctrl</kbd> + C', '<https://exemple.fr>', '**gras**', ':icon{name="x"} texte', '    ## indenté', '-x', '#x', '[lien](/a)', 'a | b', '[^1] renvoi'])
      expect(opensBlock(line), line).toBe(false)
  })

  it('escapes each of them into a line of text', () => {
    for (const line of OPENING) {
      const escaped = escapeBlockStart(line)
      expect(escaped, line).not.toBe(line)
      expect(opensBlock(escaped), escaped).toBe(false)
    }
    expect(escapeBlockStart('1. x')).toBe('1\\. x')
    expect(escapeBlockStart('::Nom')).toBe('\\:\\:Nom')
    expect(escapeBlockStart('  - x')).toBe('  \\- x')
  })

  it('escapes each of them into text MDC keeps in the paragraph', async () => {
    for (const line of OPENING) {
      const escaped = escapeBlockStart(line)
      for (const raw of [escaped, `début\n${escaped}`, `a | b\n${escaped}`]) {
        const [slide] = await PARSERS.separator.parse(raw, {} as never)
        expect(slide!.body.children.map((node: any) => node.tag), raw).toEqual(['p'])
      }
    }
  })

  it('leaves a line that opens nothing as it is', () => {
    expect(escapeBlockStart('texte')).toBe('texte')
  })
})

describe('the text of a heading and of a list item', () => {
  const text = (source: string) => {
    const range = headingTextRange(source)
    return range && { text: source.slice(range.from, range.to).trim(), underlined: range.underlined }
  }

  it('reads a heading without its marks, its closing marks and its underline', () => {
    expect(text('## Un **titre**')).toEqual({ text: 'Un **titre**', underlined: false })
    expect(text('### Un titre ###  ')).toEqual({ text: 'Un titre', underlined: false })
    expect(text('## Langage C\\#')).toEqual({ text: 'Langage C\\#', underlined: false })
    expect(text('Un titre\nsur deux lignes\n===')).toEqual({ text: 'Un titre\nsur deux lignes', underlined: true })
    expect(text('## #')).toEqual({ text: '', underlined: false })
  })

  it('escapes the marks that would close a heading', async () => {
    expect(escapeHeadingClose('Langage C #')).toBe('Langage C \\#')
    expect(escapeHeadingClose('#')).toBe('\\#')
    expect(escapeHeadingClose('C#')).toBe('C#')
    expect(text(`## ${escapeHeadingClose('Langage C #')}`)!.text).toBe('Langage C \\#')
    const [slide] = await PARSERS.separator.parse(`## ${escapeHeadingClose('Langage C #')}`, {} as never)
    expect(slide!.header!.children[0].children[0].value).toBe('Langage C #')
  })

  it('starts the text of a list item after its marker and the box of a task', () => {
    for (const [source, start] of [['- un', 1], ['  1. deux', 4], ['- [ ] tâche', 5], ['* [X] faite', 5], ['-', 1]] as const)
      expect(listItemTextStart(source), source).toBe(start)
  })

  it('reads the quote marks and the indentation that start a line', () => {
    expect(containerPrefix('> et continue')).toBe('> ')
    expect(containerPrefix('  > > suite')).toBe('  > > ')
    expect(containerPrefix('  dure')).toBe('  ')
    expect(containerPrefix('texte')).toBe('')
  })
})
