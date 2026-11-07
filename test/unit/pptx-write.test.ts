import type { Slide } from '@vignettes/core/deck'
import type { PptxFont, PptxImage, PptxStyle } from '@vignettes/pptx'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { componentKey, deckComponentNamed, NOTES_COMPONENT, parserIdFor, registerDeckComponents, resetDeckComponents, splitFrontmatter } from '@vignettes/core/deck'
import { NATIVE_COMPONENTS, writePptx } from '@vignettes/pptx'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import JSZip from 'jszip'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

const ROOT = join(import.meta.dirname, '../..')
const RECETTE = 'test/recette/decks/recette-export-powerpoint.md'
const DECKS = [...readdirSync(join(ROOT, 'examples')).filter(name => name.endsWith('.md')).map(name => `examples/${name}`), RECETTE]

// A one pixel PNG, given for every image except the addresses the loader refuses.
const PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const PIXEL: PptxImage = { data: `data:image/png;base64,${PIXEL_BASE64}`, width: 4, height: 3 }
const REFUSED = 'python.org'

beforeAll(() => {
  registerDeckComponents(SCHEMA_COMPONENTS)
  registerDeckComponents(STORYBOOK_COMPONENTS)
})

// The writer reaches no resource: any request fails the test.
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('the writer fetched a resource')
  })
  vi.stubGlobal('XMLHttpRequest', class {
    constructor() {
      throw new Error('the writer opened a request')
    }
  })
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => resetDeckComponents())

interface Written {
  meta: Record<string, unknown>
  slides: Slide[]
  zip: JSZip
  loaded: string[]
}

async function parse(raw: string): Promise<{ meta: Record<string, unknown>, slides: Slide[] }> {
  const meta = splitFrontmatter(raw).data as Record<string, unknown>
  const slides = await PARSERS[parserIdFor(meta)].parse(raw, meta)
  return { meta, slides }
}

async function write(raw: string, style?: PptxStyle, font?: PptxFont): Promise<Written> {
  const { meta, slides } = await parse(raw)
  const loaded: string[] = []
  const bytes = await writePptx({ slides, meta }, {
    style,
    font,
    resolveUrl: url => new URL(url, 'https://studio.example/slides/deck').href,
    loadImage: async (url) => {
      loaded.push(url)
      return url.includes(REFUSED) ? undefined : PIXEL
    },
  })
  return { meta, slides, zip: await JSZip.loadAsync(bytes), loaded }
}

// The look of a DSFR deck as the host measures it on its rendered slides.
const STYLE: PptxStyle = {
  width: 1200,
  height: 800,
  padding: { x: 64, y: 28 },
  font: 'Marianne',
  mono: 'Consolas',
  bodySize: 24,
  text: '3A3A3A',
  title: '161616',
  mention: '666666',
  accent: '000091',
  pretitle: { color: '666666', size: 21.6 },
  quote: { color: '161616', italic: false, bold: true },
  code: { surface: '1B1B35', text: 'E1E4E8', size: 15 },
  table: { headSurface: '000091', headText: 'FFFFFF', line: 'DDDDDD' },
  frame: { surface: 'F5F5FE', line: 'DDDDDD', text: '666666' },
  roles: {
    title: { background: 'F5F5FE', title: '000091', titleSize: 64, titleBold: true, text: '3A3A3A' },
    section: { background: '000091', title: 'FFFFFF', titleSize: 64, titleBold: true, text: 'E3E3FD' },
    content: { background: 'FFFFFF', title: '161616', titleSize: 40, titleBold: true, text: '3A3A3A' },
  },
}

/** The vertical offset, in slide pixels of a 1200 pixel wide deck, of the shape of a slide that holds `text`. */
function offsetOf(xml: string, text: string): number | undefined {
  const shape = xml.split('<p:sp>').find(part => part.includes(`<a:t>${text}`))
  const y = shape?.match(/<a:off x="\d+" y="(\d+)"/)?.[1]
  return y === undefined ? undefined : Number(y) / 914400 / (13.333 / 1200)
}

const shown = (slides: readonly Slide[]) => slides.flatMap(slide => slide.verticalSlides?.length ? slide.verticalSlides : [slide])

function slidePaths(zip: JSZip, folder: 'slides' | 'notesSlides', prefix: string): string[] {
  return Object.keys(zip.files)
    .filter(path => new RegExp(`^ppt/${folder}/${prefix}\\d+\\.xml$`).test(path))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
}

const unescape = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&')

/** The text of an XML part: the runs of a paragraph joined as they are, a line break as a space, the paragraphs apart. */
function xmlText(xml: string): string {
  return xml.split('</a:p>').map(paragraph => [...paragraph.matchAll(/<a:t>([^<]*)<\/a:t>|<a:br\/>/g)]
    .map(match => match[1] === undefined ? ' ' : unescape(match[1]))
    .join('')).join(' ')
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').replace(/[’‘]/g, '\'').replace(/[«»]/g, '"').trim()

interface Node { type: string, tag?: string, value?: string, props?: Record<string, unknown>, children?: Node[] }

function isFrame(node: Node) {
  const component = node.type === 'element' && node.tag ? deckComponentNamed(node.tag) : undefined
  return Boolean(component && !NATIVE_COMPONENTS.map(componentKey).includes(componentKey(component.name)))
}

/** The texts of a body, read from the tree here: none from the notes, the frames or the bindings. */
function bodyTexts(node: Node | undefined, texts: string[] = []): string[] {
  if (!node)
    return texts
  if (node.type === 'text' && node.value?.trim())
    texts.push(node.value)
  if (node.type === 'element' && (node.tag === 'binding' || isFrame(node) || componentKey(node.tag ?? '') === componentKey(NOTES_COMPONENT)))
    return texts
  node.children?.forEach(child => bodyTexts(child, texts))
  return texts
}

describe('writePptx', () => {
  it.each(DECKS)('writes a slide per slide shown, with every text of its body (%s)', async (path) => {
    const { slides, zip } = await write(readFileSync(join(ROOT, path), 'utf8'))
    const paths = slidePaths(zip, 'slides', 'slide')
    const shownSlides = shown(slides)
    expect(paths).toHaveLength(shownSlides.length)
    for (const [index, slide] of shownSlides.entries()) {
      const text = normalize(xmlText(await zip.file(paths[index]!)!.async('string')))
      for (const expected of bodyTexts(slide.body as Node))
        expect(text, `slide ${index + 1} of ${path}`).toContain(normalize(expected))
    }
  })

  it('puts in the file the bytes the host gives for each image', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const media = Object.keys(zip.files).filter(path => path.startsWith('ppt/media/') && !zip.files[path]!.dir)
    expect(media.length).toBeGreaterThan(0)
    for (const path of media)
      expect(await zip.file(path)!.async('base64'), path).toBe(PIXEL_BASE64)
  })

  it('writes one set of properties per paragraph, before its runs, and the notes masters before the slides', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const parts = Object.keys(zip.files).filter(path => /^ppt\/(?:slides|slideLayouts|slideMasters|notesSlides)\/[^/]+\.xml$/.test(path))
    for (const path of parts) {
      for (const [, inner] of (await zip.file(path)!.async('string')).matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
        const properties = [...inner!.matchAll(/<a:pPr\b/g)]
        expect(properties.length, path).toBeLessThanOrEqual(1)
        if (properties.length)
          expect(inner!.slice(0, properties[0]!.index).trim(), path).toBe('')
      }
    }
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    expect(presentation.indexOf('<p:notesMasterIdLst>')).toBeLessThan(presentation.indexOf('<p:sldIdLst>'))
  })

  it('keeps the paragraphs of a loose list item apart, in the item', async () => {
    const { zip } = await write('---\ntitle: Liste\n---\n\n### Une liste lâche\n\n- premier paragraphe\n\n  second paragraphe\n\n- un autre point\n')
    const xml = await zip.file(slidePaths(zip, 'slides', 'slide')[0]!)!.async('string')
    const item = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map(match => match[0]).find(paragraph => paragraph.includes('premier paragraphe'))!
    expect(item).toMatch(/<a:buChar[\s\S]*premier paragraphe[\s\S]*<a:br\/>[\s\S]*second paragraphe/)
  })

  it('writes a Columns block that holds one Column as two columns side by side, as the page shows it', async () => {
    const { zip } = await write('---\ntitle: Colonnes\n---\n\n### Une colonne\n\n:::Columns\nUn paragraphe avant.\n\n::Column\nLa seule colonne.\n::\n:::\n')
    const xml = await zip.file(slidePaths(zip, 'slides', 'slide')[0]!)!.async('string')
    const shapeOf = (text: string) => xml.split('<p:sp>').find(shape => shape.includes(`<a:t>${text}</a:t>`))
    const offset = (shape: string | undefined) => shape?.match(/<a:off x="(\d+)" y="(\d+)"/)?.slice(1).map(Number)
    const [beforeX, beforeY] = offset(shapeOf('Un paragraphe avant.')) ?? []
    const [columnX, columnY] = offset(shapeOf('La seule colonne.')) ?? []
    expect(beforeX).toBeDefined()
    expect(columnX).toBeGreaterThan(beforeX!)
    expect(columnY).toBe(beforeY)
  })

  it('writes a title in the title placeholder, and none for a hidden heading', async () => {
    const { slides, zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const paths = slidePaths(zip, 'slides', 'slide')
    const first = await zip.file(paths[0]!)!.async('string')
    expect(first).toMatch(/<p:ph[^>]*type="title"[^>]*\/>[\s\S]*?<a:t>Export PowerPoint<\/a:t>/)
    const hidden = shown(slides).findIndex(slide => slide.layout?.heading === 'hidden')
    expect(xmlText(await zip.file(paths[hidden]!)!.async('string'))).not.toContain('Titre masqué')
  })

  it('writes the notes in the speaker notes, and on no slide', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const slides = await Promise.all(slidePaths(zip, 'slides', 'slide').map(path => zip.file(path)!.async('string')))
    const notes = await Promise.all(slidePaths(zip, 'notesSlides', 'notesSlide').map(path => zip.file(path)!.async('string')))
    expect(notes.map(xmlText).join(' ')).toContain('Ce que l\'orateur dit sur les paragraphes.')
    expect(notes.map(xmlText).join(' ')).toContain('- Une note en liste.')
    expect(slides.map(xmlText).join(' ')).not.toContain('Ce que l\'orateur dit')
  })

  it('writes a frame with its label and link for a component, a story and a refused image', async () => {
    const { zip, loaded } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const all = (await Promise.all(Object.keys(zip.files).filter(path => /^ppt\/slides\/(?:_rels\/)?slide\d+\.xml(?:\.rels)?$/.test(path)).map(path => zip.file(path)!.async('string')))).join('\n')
    expect(xmlText(all)).toContain('Schéma de cartes')
    expect(all).toContain('https://storybook.example.org/iframe.html?id=compositions-job-board--in-progress')
    expect(xmlText(all)).toContain('Le logo d\'un site qui refuse la lecture par un autre site')
    expect(all).toContain('https://www.python.org/static/img/python-logo.png')
    expect(loaded).toContain('https://studio.example/images/placeholder.svg')
  })

  it('writes the value of a binding to any key of the frontmatter', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const texts = await Promise.all(slidePaths(zip, 'slides', 'slide').map(path => zip.file(path)!.async('string')))
    expect(normalize(texts.map(xmlText).join(' '))).toContain('préparé pour Direction de l\'essai')
  })

  it('writes the default value of a binding that reads past the deck\'s data, as the renderer does', async () => {
    const { zip } = await write('---\ntitle: Liaisons\ntags: étiquette\n---\n\n### Liaisons\n\nValeur : {{ tags || \"aucune\" }}.\n')
    const text = xmlText(await zip.file(slidePaths(zip, 'slides', 'slide')[0]!)!.async('string'))
    expect(text).not.toContain('étiquette')
  })

  it('takes the font of the theme, and white text over a veil, drawn when its image is absent', async () => {
    const { slides, zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    expect(await zip.file('ppt/theme/theme1.xml')!.async('string')).toContain('<a:latin typeface="Marianne"')
    const paths = slidePaths(zip, 'slides', 'slide')
    const absent = shown(slides).findIndex(slide => slide.layout?.media?.src?.includes(REFUSED))
    const xml = await zip.file(paths[absent]!)!.async('string')
    expect(xml).toMatch(/<a:srgbClr val="000000"><a:alpha val="60000"\/>/)
    expect(xml).toContain('val="FFFFFF"')
    expect(xmlText(xml)).not.toContain('python')
  })

  it('opens a section at each section slide, after one that gathers the slides before it', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'))
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    const sections = [...presentation.matchAll(/<p14:section name="([^"]*)"/g)].map(match => unescape(match[1]!))
    expect(sections).toEqual(['Recette · Export PowerPoint', 'Le texte', 'Les images', 'Les cadres'])
  })

  it('removes the characters XML refuses', async () => {
    const { zip } = await write('---\ntitle: Contrôle\n---\n\n### Un titre\u0007\n\nUn texte\u0001 avec\u000B des caractères de contrôle.\n')
    const xml = await zip.file(slidePaths(zip, 'slides', 'slide')[0]!)!.async('string')
    expect([...xml].filter(character => ['\u0001', '\u0007', '\u000B'].includes(character))).toEqual([])
    expect(xmlText(xml)).toContain('Un texte avec des caractères de contrôle.')
  })

  it('takes the look the host measured: the surface and the title of each role, the head of a table, the accent of a link', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'), STYLE)
    const layouts = await Promise.all(Object.keys(zip.files).filter(path => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)).map(path => zip.file(path)!.async('string')))
    const section = layouts.find(xml => xml.includes('name="Section"'))!
    expect(section).toMatch(/<p:bg>[\s\S]*?<a:srgbClr val="000091"/)
    expect(section).toMatch(/type="title"[\s\S]*?<a:srgbClr val="FFFFFF"/)
    const slides = await Promise.all(slidePaths(zip, 'slides', 'slide').map(path => zip.file(path)!.async('string')))
    const table = slides.find(xml => xml.includes('<a:tbl>'))!
    expect(table).toMatch(/<a:tcPr[^>]*>[\s\S]*?<a:solidFill><a:srgbClr val="000091"/)
    const link = slides.find(xml => xml.includes('<a:t>un lien</a:t>'))!
    expect(link).toMatch(/<a:rPr[^>]*>(?:(?!<\/a:rPr>)[\s\S])*?<a:srgbClr val="000091"\/>(?:(?!<\/a:rPr>)[\s\S])*?<a:hlinkClick[\s\S]*?<a:t>un lien<\/a:t>/)
  })

  it('takes from the fixed master the values the host could not read', async () => {
    const { zip } = await write(readFileSync(join(ROOT, RECETTE), 'utf8'), { roles: { section: { background: '000091' } } })
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    expect(presentation).toMatch(/<p:sldSz cx="12191695" cy="88897\d\d"/)
    const slides = await Promise.all(slidePaths(zip, 'slides', 'slide').map(path => zip.file(path)!.async('string')))
    expect(slides.find(xml => xml.includes('<a:tbl>'))).toContain('<a:srgbClr val="D0D0D0"/>')
    const layouts = await Promise.all(Object.keys(zip.files).filter(path => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)).map(path => zip.file(path)!.async('string')))
    expect(layouts.find(xml => xml.includes('name="Section"'))).toMatch(/<p:bg>[\s\S]*?<a:srgbClr val="000091"/)
    expect(layouts.find(xml => xml.includes('name="Contenu"'))).toMatch(/<p:bg>[\s\S]*?<a:srgbClr val="FFFFFF"/)
  })

  it('writes a body where the host measured it, and in the box of its layout when the measured slides do not match the deck', async () => {
    const raw = '---\ntitle: Mesures\n---\n\n### Un titre\n\nUn paragraphe centré sous le titre.\n'
    const boxes = { title: { x: 64, y: 112, w: 1072, h: 44 }, body: { x: 64, y: 300, w: 1072, h: 40 } }
    const measured = await write(raw, { ...STYLE, slides: [boxes] })
    const xml = await measured.zip.file(slidePaths(measured.zip, 'slides', 'slide')[0]!)!.async('string')
    expect(offsetOf(xml, 'Un paragraphe')).toBeCloseTo(300, 0)
    const unmatched = await write(raw, { ...STYLE, slides: [boxes, boxes] })
    const placeholder = await unmatched.zip.file(slidePaths(unmatched.zip, 'slides', 'slide')[0]!)!.async('string')
    expect(placeholder).toMatch(/<p:ph[^>]*type="body"/)
  })

  it('embeds the font the host gives under its family, and leaves out a format it does not read', async () => {
    const raw = '---\ntitle: Police\n---\n\n### Un titre\n\nUn paragraphe.\n'
    const woff = readFileSync(join(ROOT, 'node_modules/@gouvfr/dsfr/dist/fonts/Marianne-Regular.woff'))
    const { zip } = await write(raw, STYLE, { family: 'Une police', data: new Uint8Array(woff).buffer })
    expect(await zip.file('ppt/theme/theme1.xml')!.async('string')).toContain('<a:latin typeface="Une police"')
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    const id = /<p:embeddedFontLst><p:embeddedFont><p:font typeface="Une police"\/><p:regular r:id="(rId\d+)"\/>/.exec(presentation)?.[1]
    const target = new RegExp(`Id="${id}" Target="(fonts/[^"]+\\.fntdata)"`).exec(await zip.file('ppt/_rels/presentation.xml.rels')!.async('string'))?.[1]
    expect(zip.file(`ppt/${target}`)).toBeTruthy()
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('Extension="fntdata"')

    const woff2 = readFileSync(join(ROOT, 'node_modules/@gouvfr/dsfr/dist/fonts/Marianne-Regular.woff2'))
    const unread = await write(raw, STYLE, { family: 'Une police', data: new Uint8Array(woff2).buffer })
    expect(await unread.zip.file('ppt/presentation.xml')!.async('string')).not.toContain('embeddedFont')
    expect(await unread.zip.file('ppt/theme/theme1.xml')!.async('string')).toContain('<a:latin typeface="Marianne"')
  })

  it('reads a frontmatter it cannot trust', async () => {
    const { zip } = await write('---\ntitle: 3\nreveal:\n  width: "1200"\n---\n\n### Un titre\n')
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    // 960 × 700, Reveal's own size, on a slide 13.333 inches wide.
    expect(presentation).toMatch(/<p:sldSz cx="12191695" cy="88897\d\d"/)
  })
})
