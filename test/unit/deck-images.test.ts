import type { DeckComponent, ImageSource } from '@vignettes/core/deck'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILT_IN_COMPONENTS,
  classifyImageSource,
  DECK_ANNOTATIONS,
  deckImageSources,
  leftImagePaths,
  LEGACY_COMPONENTS,
  parserIdFor,
  registerDeckComponents,
  resetDeckComponents,
  splitFrontmatter,
  unreadImagePaths,
  withImageSources,
} from '@vignettes/core/deck'
import { collectAssets } from '@vignettes/core/render'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { referencedImages } from '../../layers/studio/shared/storage/media-refs'
import { referencedDeckAssets } from '../../packages/freeze/src/assets.ts'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

// The components the command line registers (packages/cli/src/components.ts).
beforeAll(() => registerDeckComponents([...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS]))
afterAll(() => resetDeckComponents())

const UPLOADED = '/media/0123456789abcdef0123456789abcdef.png'

/** Each source as `[value, kind, written text at its place]`. */
function read(raw: string) {
  const lines = raw.split('\n')
  return deckImageSources(raw).map(source => [source.value, source.source.kind, lines[source.line - 1]!.slice(source.column, source.column + source.length)])
}

/** The local paths of a deck, each one under a name made from it. */
function namesOf(raw: string): Map<string, string> {
  const names = new Map<string, string>()
  for (const { source } of deckImageSources(raw)) {
    if (source.kind === 'local')
      names.set(source.path, `${source.path.replace(/\W/g, '').padEnd(32, '0').slice(0, 32)}.png`)
  }
  return names
}

describe('the class of an image address (classifyImageSource)', () => {
  it.each([
    ['./a.png', { kind: 'local', path: './a.png', suffix: '' }],
    ['images/a.png', { kind: 'local', path: 'images/a.png', suffix: '' }],
    ['..x.png', { kind: 'local', path: '..x.png', suffix: '' }],
    ['./a%20b.png', { kind: 'local', path: './a b.png', suffix: '' }],
    ['./a.png?v=2', { kind: 'local', path: './a.png', suffix: '?v=2' }],
    ['./icons.svg#star', { kind: 'local', path: './icons.svg', suffix: '#star' }],
    ['  ./a.png ', { kind: 'local', path: './a.png', suffix: '' }],
    ['./a\n.png', { kind: 'local', path: './a.png', suffix: '' }],
    [UPLOADED, { kind: 'uploaded' }],
    ['/images/a.png', { kind: 'site' }],
    ['/themes/ministere/assets/operateur.svg', { kind: 'site' }],
    ['/frozen/deck/a.png', { kind: 'site' }],
    ['/favicon.svg', { kind: 'site' }],
    ['https://example.org/a.png', { kind: 'remote' }],
    ['HTTP://example.org/a.png', { kind: 'remote' }],
    ['data:image/png;base64,AA', { kind: 'data' }],
    ['data:image/x-icon;base64,AA', { kind: 'other' }],
    ['#x', { kind: 'other' }],
    ['?v=1', { kind: 'other' }],
    ['', { kind: 'other' }],
    ['/media/a.png', { kind: 'other' }],
    ['/autre/a.png', { kind: 'other' }],
    ['//example.org/a.png', { kind: 'other' }],
    ['.\\a.png', { kind: 'other' }],
    ['./a%zz.png', { kind: 'other' }],
    ['javascript:alert(1)', { kind: 'other' }],
    ['c:a.png', { kind: 'other' }],
  ])('reads %j', (value, expected) => {
    expect(classifyImageSource(value)).toEqual(expected)
  })
})

describe('the image sources of a deck (deckImageSources)', () => {
  it('reads the markdown images, a destination between angle brackets at its place', () => {
    expect(read('![x](<./a b.png>) ![y](./c.png?v=2) ![z](https://e.org/z.png) [d](./d.png)')).toEqual([
      ['./a b.png', 'local', './a b.png'],
      ['./c.png?v=2', 'local', './c.png?v=2'],
      ['https://e.org/z.png', 'remote', 'https://e.org/z.png'],
    ])
  })

  it('reads the media of :layout and of the earlier forms that is an image', () => {
    const raw = [
      ':layout{media="right" src="./l.png"}',
      ':layout{src="./page.html"}',
      ':layout{src="./typed" type="image"}',
      ':layout{story="x" src="./story.png"}',
      '::FullScreenImage{src="./f.png"}',
      '::',
      '::SplitSlide{src="./s.png" type="image"}',
      '::',
      '::SplitSlide{src="./frame.png"}',
      '::',
    ].join('\n')
    expect(read(raw)).toEqual([
      ['./l.png', 'local', './l.png'],
      ['./typed', 'local', './typed'],
      ['./f.png', 'local', './f.png'],
      ['./s.png', 'local', './s.png'],
    ])
  })

  it('reads the last src of a block, the one the renderer shows', () => {
    const raw = ':layout{src="./x.png" src="./y.png"}\n\n::StoryFrame{src="./a.png" type="image" src="./b.png"}\n::'
    expect(read(raw)).toEqual([
      ['./y.png', 'local', './y.png'],
      ['./b.png', 'local', './b.png'],
    ])
  })

  it('reads the src of a StoryFrame that is an image, alone or in a Screens', () => {
    const raw = [
      '::StoryFrame{src="./a.png" type="image"}',
      '::',
      '::StoryFrame{story="x" src="./b.png" type="image"}',
      '::',
      '::StoryFrame{story="x" src="./repli.png"}',
      '::',
      '::Screens',
      '::StoryFrame{src="./c.png" type="image"}',
      '::',
      '::',
    ].join('\n')
    expect(read(raw)).toEqual([
      ['./a.png', 'local', './a.png'],
      ['./b.png', 'local', './b.png'],
      ['./c.png', 'local', './c.png'],
    ])
    expect(withImageSources(raw, namesOf(raw)).text).toContain(`::StoryFrame{src="/media/${namesOf(raw).get('./c.png')}" type="image"}`)
  })

  it('reads the image values of the front matter placed between their quotes', () => {
    const raw = '---\ntitle: T\nbrand:\n  operator: ./o.svg\nbackgrounds:\n  h1: \'./h1.png\'\n  h2: "./h2.png" # a comment\n  default: /images/d.png\n---\n\n# A\n'
    expect(deckImageSources(raw).map(({ value, key, placed }) => [value, key, placed])).toEqual([
      ['./o.svg', ['brand', 'operator'], true],
      ['./h1.png', ['backgrounds', 'h1'], true],
      ['./h2.png', ['backgrounds', 'h2'], true],
      ['/images/d.png', ['backgrounds', 'default'], true],
    ])
    expect(read(raw).map(([value, , written]) => written === value)).toEqual([true, true, true, true])
  })

  it('leaves without a place a value of the front matter written in another form', () => {
    for (const frontmatter of ['brand: { operator: ./x.svg }', 'brand:\n  operator: ./x\n    y.svg', 'brand:\n  operator: "./a\\u0020b.png"', 'brand:\n  operator: &logo ./x.svg']) {
      const [source] = deckImageSources(`---\ntitle: T\n${frontmatter}\n---\n\n# A\n`)
      expect([frontmatter, source?.source.kind, source?.placed]).toEqual([frontmatter, 'local', false])
    }
  })
})

type ImageClass = 'image' | 'image by type' | 'page'

// Each attribute of the registry that takes the address of an image or that
// `:layout` reads as its `src`, with the deck that writes ./a.png in it.
const IMAGE_ATTRIBUTES: Record<string, [ImageClass, string]> = {
  'slide-background.image': ['image', ':slide-background{image="./a.png"}'],
  'Quote.avatar': ['image', '::Quote{author="A" avatar="./a.png"}\nTexte\n::'],
  'Image.src': ['image', '::Image{src="./a.png"}\n::'],
  'Iframe.src': ['page', '::Iframe{src="./a.png"}\n::'],
  'JsonTour.image': ['image', '::JsonTour{image="./a.png"}\n::'],
  'StoryFrame.src': ['image by type', '::StoryFrame{src="./a.png" type="image"}\n::'],
  'fullscreenimage.src': ['image', '::FullScreenImage{src="./a.png"}\n::'],
  'splitslide.src': ['image by type', '::SplitSlide{src="./a.png" type="image"}\n::'],
}

describe('the attributes of the registry that take an image', () => {
  const components: DeckComponent[] = [...BUILT_IN_COMPONENTS, ...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS]
  const attributes = [
    ...DECK_ANNOTATIONS.flatMap(annotation => (annotation.images ?? []).map(name => `${annotation.tag}.${name}`)),
    ...components.flatMap(component => [
      ...(component.images ?? []),
      ...Object.entries(component.layout?.attributes ?? {}).filter(([, to]) => to === 'src').map(([from]) => from),
    ].map(name => `${component.name}.${name}`)),
    ...Object.keys(LEGACY_COMPONENTS).filter(key => LEGACY_COMPONENTS[key]!({ src: 'x' }).src === 'x').map(key => `${key}.src`),
  ]

  it('has each one in the table of this test', () => {
    expect([...new Set(attributes)].sort()).toEqual(Object.keys(IMAGE_ATTRIBUTES).sort())
  })

  it.each(Object.entries(IMAGE_ATTRIBUTES))('reads ./a.png in %s', (_, [kind, raw]) => {
    if (kind === 'page') {
      expect(deckImageSources(raw)).toEqual([])
      expect(unreadImagePaths(raw).map(path => path.value)).toEqual(['./a.png'])
    }
    else {
      expect(read(raw)).toEqual([['./a.png', 'local', './a.png']])
    }
  })
})

describe('the relative paths of images the deck does not read (unreadImagePaths)', () => {
  it('reads an HTML src, a reference definition and the src of a media that is a page', () => {
    const raw = [
      '<img src="./a.png"> <img alt="x" src=\'./b.png\'>',
      '[ref]: ./c.png',
      ':layout{src="./demo.html"}',
      '::Iframe{src="./demo.html"}',
      '::',
      '::StoryFrame{story="x" src="./repli.png"}',
      '::',
      '<img src="/images/a.png"> [other]: https://e.org/a.png',
    ].join('\n')
    const lines = raw.split('\n')
    expect(unreadImagePaths(raw).map(({ value, line, column, length }) => [value, lines[line - 1]!.slice(column, column + length)])).toEqual([
      ['./a.png', './a.png'],
      ['./b.png', './b.png'],
      ['./c.png', './c.png'],
      ['./demo.html', './demo.html'],
      ['./demo.html', './demo.html'],
      ['./repli.png', './repli.png'],
    ])
  })
})

describe('the text sent to an instance (withImageSources)', () => {
  const raw = [
    '---',
    'title: T',
    'brand:',
    '  operator: \'./o.svg\'',
    '---',
    '',
    '# A',
    '',
    '![x](<./a b.png>) ![y](./a.png?v=2) ![z](./icons.svg#star) ![w](/images/w.png)',
    '',
    ':layout{media="right" src="./l.png" alt="L"}',
    '',
  ].join('\n')

  it('replaces each local source at its place, its query or fragment kept', () => {
    const names = namesOf(raw)
    const { text, unplaced } = withImageSources(raw, names)
    expect(unplaced).toEqual([])
    expect(text).toContain(`  operator: '/media/${names.get('./o.svg')}'`)
    expect(text).toContain(`![x](</media/${names.get('./a b.png')}>) ![y](/media/${names.get('./a.png')}?v=2) ![z](/media/${names.get('./icons.svg')}#star) ![w](/images/w.png)`)
    expect(text).toContain(`:layout{media="right" src="/media/${names.get('./l.png')}" alt="L"}`)
  })

  it('keeps the text as written outside the places of the local sources', () => {
    const names = namesOf(raw)
    const sentLines = withImageSources(raw, names).text.split('\n')
    const lines = raw.split('\n')
    const places = new Map<number, ImageSource[]>()
    for (const source of deckImageSources(raw)) {
      if (source.source.kind === 'local' && source.placed)
        places.set(source.line, [...(places.get(source.line) ?? []), source])
    }
    expect(places.size).toBeGreaterThan(1)
    expect(sentLines).toHaveLength(lines.length)
    lines.forEach((line, index) => {
      const at = places.get(index + 1) ?? []
      // The local line and the sent line, each cut around the places of its sources.
      const kept: string[] = []
      const sent: string[] = []
      let from = 0
      let rest = sentLines[index]!
      for (const { column, length, source } of at) {
        const written = source.kind === 'local' ? `/media/${names.get(source.path)}${source.suffix}` : ''
        kept.push(line.slice(from, column))
        from = column + length
        const found = rest.indexOf(written)
        expect(found).toBeGreaterThanOrEqual(0)
        sent.push(rest.slice(0, found))
        rest = rest.slice(found + written.length)
      }
      expect([...sent, rest]).toEqual([...kept, line.slice(from)])
    })
  })

  it('gives the place in the text of each local source it keeps as written', () => {
    const names = new Map([['./a.png', namesOf(raw).get('./a.png')!]])
    const { text, left } = withImageSources(raw, names)
    expect(left.map(({ line, column, length }) => text.split('\n')[line - 1]!.slice(column, column + length))).toEqual(['./o.svg', './a b.png', './icons.svg#star', './l.png'])
  })

  it('returns as unplaced the local sources of a front matter that reads otherwise once replaced', () => {
    const { unplaced } = withImageSources('---\ntitle: T\nbrand:\n  operator: ./o.svg\n---\n\n# A\n', new Map([['./o.svg', 'x: y']]))
    expect(unplaced.map(source => [source.value, source.placed])).toEqual([['./o.svg', false]])
  })

  it('writes names that referencedImages of the studio reads', () => {
    const names = namesOf(raw)
    const { text } = withImageSources(raw, names)
    expect(referencedImages(text)).toEqual(expect.arrayContaining([...names.values()]))
  })
})

describe('the relative paths of images left in a text (leftImagePaths)', () => {
  it('reads the paths of the forms deckImageSources does not read', () => {
    const text = '<img src=./a.png> [![x](./b.png)](https://e.org) ![a [b] c](./c.png)\n[télécharger](./d.png) ./e.jpeg https://e.org/f.png /images/g.png'
    expect(leftImagePaths(text).map(path => [path.value, text.split('\n')[path.line - 1]!.slice(path.column, path.column + path.length)])).toEqual([
      ['./a.png', './a.png'],
      ['./b.png', './b.png'],
      ['./c.png', './c.png'],
      ['./d.png', './d.png'],
      ['./e.jpeg', './e.jpeg'],
    ])
  })

  it('reads none in a text sent without a relative path of an image', () => {
    const raw = '---\ntitle: T\nbrand:\n  operator: ./o.svg\n---\n\n![x](./a.png?v=2) ![y](/images/y.png)\n'
    expect(leftImagePaths(withImageSources(raw, namesOf(raw)).text)).toEqual([])
    expect(leftImagePaths(raw).map(path => path.value)).toEqual(['./o.svg', './a.png?v=2'])
  })
})

const DECK_FOLDERS = ['test/unit/fixtures', 'test/e2e/fixtures/decks']
const DECKS = DECK_FOLDERS.flatMap(folder => readdirSync(folder).filter(name => name.endsWith('.md')).map(name => join(folder, name)))
const ANGLE_BRACKETS = ['![x](</images/a.png>)', '![x](<./a b.png>)', `![x](<${UPLOADED}>)`]

describe('the other readers of the images of a text', () => {
  it('finds in referencedImages each uploaded and /images/ source, between angle brackets too', () => {
    for (const raw of [...DECKS.map(file => readFileSync(file, 'utf8')), ...ANGLE_BRACKETS]) {
      const read = referencedImages(raw)
      for (const { value, source } of deckImageSources(raw)) {
        const path = value.split(/[?#]/)[0]!
        if (source.kind === 'uploaded')
          expect(read).toContain(path.slice('/media/'.length))
        if (source.kind === 'site' && path.startsWith('/images/'))
          expect(read).toContain(decodeURIComponent(path.slice(1)))
      }
    }
    expect(referencedImages('![x](</images/a.png>)')).toEqual(['images/a.png'])
  })

  it('finds in referencedDeckAssets each source of the deck assets', () => {
    for (const raw of [...DECKS.map(file => readFileSync(file, 'utf8')), ...ANGLE_BRACKETS]) {
      const assets = referencedDeckAssets(raw)
      for (const { value } of deckImageSources(raw)) {
        const path = value.split(/[?#]/)[0]!
        if (/^\/(?:images|backgrounds|pictograms)\//.test(path))
          expect(assets).toContain(path)
      }
    }
  })

  it.each(DECKS)('finds among the sources of %s each image collectAssets gives a renderer', async (file) => {
    const raw = readFileSync(file, 'utf8')
    const meta = splitFrontmatter(raw).data as Record<string, unknown>
    const slides = await PARSERS[parserIdFor(meta)].parse(raw, meta)
    const values = deckImageSources(raw).map(source => source.value.trim())
    const images = collectAssets(slides, { backgrounds: meta.backgrounds as never, brand: meta.brand }).filter(asset => asset.kind === 'image').map(asset => asset.url)
    expect(images.filter(url => !values.includes(url))).toEqual([])
  })
})
