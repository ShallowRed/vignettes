import { editedText, keepsStructure, typedTextChange } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { PARSERS } from '../../packages/nuxt/src/runtime/utils/slide-ast.ts'

describe('editedText', () => {
  it('keeps a heading on one line, and escapes the marks that would close it', () => {
    expect(editedText('heading', '  Un titre\nsur deux lignes  ', 'Un titre')).toBe('Un titre sur deux lignes')
    expect(editedText('heading', '1. Introduction', 'Introduction')).toBe('1. Introduction')
    expect(editedText('heading', 'Langage C #', 'Langage C')).toBe('Langage C \\#')
  })

  it('keeps the hard breaks of a paragraph and drops its blank lines', () => {
    expect(editedText('paragraph', 'Avant  \naprès\n\n\nfin', 'Avant  \naprès')).toBe('Avant  \naprès\nfin')
    expect(editedText('paragraph', 'Un\r\ntexte', 'Un texte')).toBe('Un\ntexte')
  })

  it('escapes a line that would open a block, and keeps one that stays as written', () => {
    expect(editedText('paragraph', '- une puce', 'Un texte')).toBe('\\- une puce')
    expect(editedText('paragraph', 'Un texte\n---', 'Un texte')).toBe('Un texte\n\\---')
    expect(editedText('item', '- - x', 'x')).toBe('\\- - x')
    expect(editedText('underlined-heading', '## Titre', 'Titre')).toBe('\\## Titre')
    expect(editedText('paragraph', '<kbd>Ctrl</kbd> + C, puis V', '<kbd>Ctrl</kbd> + C')).toBe('<kbd>Ctrl</kbd> + C, puis V')
    expect(editedText('paragraph', 'Le bilan\n2. deux', 'Le texte\n2. deux')).toBe('Le bilan\n2. deux')
  })

  it('keeps the quote marks and the indentation of the lines after the first', () => {
    expect(editedText('paragraph', 'Une citation\n> et une autre suite', 'Une citation\n> et continue')).toBe('Une citation\n> et une autre suite')
    expect(editedText('paragraph', 'Une citation\net une autre suite', 'Une citation\n> et continue')).toBe('Une citation\n> et une autre suite')
    expect(editedText('paragraph', 'Une citation\n> - suite', 'Une citation\n> et continue')).toBe('Une citation\n> \\- suite')
    expect(editedText('item', 'ligne  \ndure et longue', 'ligne  \n  dure')).toBe('ligne  \n  dure et longue')
  })
})

describe('typedTextChange', () => {
  const doc = '## Titre\n\nUn texte.\n\n## Suite\n\nFin.\n'
  const range = { from: doc.indexOf('Un texte.'), to: doc.indexOf('Un texte.') + 9 }

  it('writes the text typed in place of the text written', () => {
    const change = typedTextChange(doc, range, 'Un texte.', 'Un autre texte.', 'paragraph', 'heading')
    expect(change).toEqual({ from: range.from, to: range.to, insert: 'Un autre texte.' })
  })

  it('writes nothing for a text unchanged or empty', () => {
    expect(typedTextChange(doc, range, 'Un texte.', '  Un texte.\n', 'paragraph', 'heading')).toBeUndefined()
    expect(typedTextChange(doc, range, 'Un texte.', ' \n ', 'paragraph', 'heading')).toBeUndefined()
  })

  it('refuses a text the document no longer holds', () => {
    expect(typedTextChange(doc.replace('Un texte.', 'Un texte modifié.'), range, 'Un texte.', 'Autre', 'paragraph', 'heading')).toBe('conflict')
  })

  it('keeps the paragraph and the slides of the deck, for each line that would open a block', async () => {
    const lines = ['## x', '# x', '---', '===', '- x', '1. x', '2. x', '> x', '```', '::Nom', '::', '<!-- x', '<div>', '<style>p{}', '| a |', '--|--', '[a]: /b', '[^1]: note', ':layout{media="right"}']
    const tags = async (text: string, parser: 'heading' | 'separator') =>
      (await PARSERS[parser].parse(text, {} as never)).map(slide => slide.body.children.map((node: any) => node.tag))
    for (const parser of ['heading', 'separator'] as const) {
      const before = await tags(doc, parser)
      for (const line of lines) {
        for (const typed of [line, `Un texte.\n${line}`]) {
          const change = typedTextChange(doc, range, 'Un texte.', typed, 'paragraph', parser)
          expect(typeof change, `${parser}: ${typed}`).toBe('object')
          const { from, to, insert } = change as { from: number, to: number, insert: string }
          expect(await tags(doc.slice(0, from) + insert + doc.slice(to), parser), `${parser}: ${typed}`).toEqual(before)
        }
      }
    }
  })
})

describe('keepsStructure', () => {
  it('tells a text that adds a slide or leaves a block open', () => {
    const doc = '## Titre\n\nUn texte.\n'
    expect(keepsStructure(doc, doc.replace('Un texte.', 'Un autre texte.'), 'heading')).toBe(true)
    expect(keepsStructure(doc, doc.replace('Un texte.', 'Un texte.\n\n## Suite'), 'heading')).toBe(false)
    expect(keepsStructure(doc, doc.replace('Un texte.', '::Nom\nUn texte.'), 'heading')).toBe(false)
  })
})
