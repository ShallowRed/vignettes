import type { OutlineEdit, ParserId } from '@vignettes/core/deck'
import { applyTextChanges, deckOutline, duplicateEdit, moveStackEdit, removeEdit, renameChange, splitSlides } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

const HEADING = '---\ntitle: Essai\n---\n\n# Bilan\n\nSous-titre\n\n## Un\n\nTexte un.\n\n### Un bis\n\nTexte un bis.\n\n## Deux\n\nTexte deux.\n\n---\n\nSans titre.\n'
const SEPARATOR = '# Bilan\n\n---\n\n## Un\n\nTexte un.\n\n----\n\n## Un bis\n\n---\n\n## Deux\n\nTexte deux.'

function applied(raw: string, edit: OutlineEdit | undefined): string {
  expect(edit).toBeDefined()
  return applyTextChanges(raw, edit!.changes)
}

const titles = (raw: string, parser: ParserId) => deckOutline(raw, parser).map(slide => `${slide.h}.${slide.v} ${slide.title?.text ?? '-'}`)

describe('deckOutline', () => {
  it('has one entry per slide of splitSlides, with its title', () => {
    expect(titles(HEADING, 'heading')).toEqual(['0.0 Bilan', '1.0 Un', '1.1 Un bis', '2.0 Deux', '3.0 -'])
    expect(titles(SEPARATOR, 'separator')).toEqual(['0.0 Bilan', '1.0 Un', '1.1 Un bis', '2.0 Deux'])
    for (const [raw, parser] of [[HEADING, 'heading'], [SEPARATOR, 'separator']] as const)
      expect(deckOutline(raw, parser).map(({ h, v }) => ({ h, v }))).toEqual(splitSlides(raw, parser).map(({ h, v }) => ({ h, v })))
  })

  it('gives the start of the text of each slide, after its separator and its blank lines', () => {
    expect(deckOutline(SEPARATOR, 'separator').map(slide => SEPARATOR.slice(slide.contentFrom, slide.contentFrom + 5))).toEqual(['# Bil', '## Un', '## Un', '## De'])
  })

  it('reads a title of any level, underlined, with marks, and none in code or below a separator', () => {
    const raw = '#### Un **titre** \\# fin\n\n---\n\nTitre\nsouligné\n===\n\n---\n\n```\n## pas un titre\n```\n\n---\n\nPara\n---\nB\n\n---\n\n::Notes\n## pas un titre\n::'
    expect(titles(raw, 'separator')).toEqual(['0.0 Un titre # fin', '1.0 Titre souligné', '2.0 -', '3.0 -', '4.0 -', '5.0 -'])
    const [first] = deckOutline(raw, 'separator')
    expect(raw.slice(first!.title!.from, first!.title!.to)).toBe('Un **titre** \\# fin')
  })
})

describe('moveStackEdit', () => {
  it('moves a stack and its verticals, and leaves the other stacks as written', () => {
    const after = applied(HEADING, moveStackEdit(HEADING, 'heading', 1, 2))
    expect(titles(after, 'heading')).toEqual(['0.0 Bilan', '1.0 Deux', '2.0 Un', '2.1 Un bis', '3.0 -'])
    expect(after.startsWith('---\ntitle: Essai\n---\n\n# Bilan\n\nSous-titre\n\n')).toBe(true)
    expect(after).toContain('---\n\nSans titre.\n')
  })

  it('moves the last stack, and the first stack or to the first place, with and without frontmatter', () => {
    const last = applied(HEADING, moveStackEdit(HEADING, 'heading', 3, 2))
    expect(titles(last, 'heading')).toEqual(['0.0 Bilan', '1.0 Un', '1.1 Un bis', '2.0 -', '3.0 Deux'])
    const headings = '## Un\n\nTexte un.\n\n## Deux\n\nTexte deux.\n\n## Trois\n'
    for (const raw of [headings, `---\ntitle: Essai\n---\n\n${headings}`]) {
      expect(titles(applied(raw, moveStackEdit(raw, 'heading', 0, 2)), 'heading')).toEqual(['0.0 Deux', '1.0 Trois', '2.0 Un'])
      expect(titles(applied(raw, moveStackEdit(raw, 'heading', 2, 0)), 'heading')).toEqual(['0.0 Trois', '1.0 Un', '2.0 Deux'])
      expect(titles(applied(raw, removeEdit(raw, 'heading', 0, 0)), 'heading')).toEqual(['0.0 Deux', '1.0 Trois'])
      expect(applied(raw, moveStackEdit(raw, 'heading', 2, 0)).startsWith(raw.startsWith('---') ? '---\ntitle: Essai\n---\n\n## Trois\n\n## Un' : '## Trois\n\n## Un')).toBe(true)
    }
    for (const raw of [SEPARATOR, `---\ntitle: Essai\n---\n\n${SEPARATOR}`]) {
      const first = applied(raw, moveStackEdit(raw, 'separator', 0, 2))
      expect(titles(first, 'separator')).toEqual(['0.0 Un', '0.1 Un bis', '1.0 Deux', '2.0 Bilan'])
      expect(first.replace(/^---\ntitle: Essai\n---\n/, '').trimStart().startsWith('---')).toBe(false)
      const toFirst = applied(raw, moveStackEdit(raw, 'separator', 2, 0))
      expect(titles(toFirst, 'separator')).toEqual(['0.0 Deux', '1.0 Bilan', '2.0 Un', '2.1 Un bis'])
      expect(toFirst.replace(/^---\ntitle: Essai\n---\n/, '').trimStart().startsWith('---')).toBe(false)
    }
  })

  it('keeps the blank lines after the frontmatter and at the start of the deck', () => {
    const raw = '---\ntitle: Essai\n---\n\n# Bilan\n\n---\n\n## Un\n\n---\n\n## Deux\n'
    expect(applied(raw, moveStackEdit(raw, 'separator', 2, 0))).toBe('---\ntitle: Essai\n---\n\n## Deux\n\n---\n\n# Bilan\n\n---\n\n## Un\n')
    expect(applied(raw, removeEdit(raw, 'separator', 0, 0))).toBe('---\ntitle: Essai\n---\n\n## Un\n\n---\n\n## Deux\n')
    const bare = '# Bilan\n\n---\n\n## Un\n'
    expect(applied(bare, removeEdit(bare, 'separator', 0, 0))).toBe('## Un\n')
  })

  it('keeps a separator stack whose text holds an empty vertical part', () => {
    const raw = 'A\n\n---\n\nB\n\n----\n\n\n---\n\nC'
    expect(titles(applied(raw, moveStackEdit(raw, 'separator', 1, 2)), 'separator')).toEqual(['0.0 -', '1.0 -', '2.0 -'])
    expect(applied(raw, moveStackEdit(raw, 'separator', 1, 2))).toMatch(/C[\s\S]*B\n\n----/)
  })

  it('places the caret at the start of the moved stack', () => {
    const edit = moveStackEdit(HEADING, 'heading', 2, 1)
    expect(applied(HEADING, edit).slice(edit!.anchor).startsWith('## Deux')).toBe(true)
  })

  it('refuses a move that would change the slides of the deck', () => {
    // Right after the title slide, a slide opened by `---` without a title joins it.
    expect(moveStackEdit(HEADING, 'heading', 3, 1)).toBeUndefined()
    expect(moveStackEdit(HEADING, 'heading', 1, 1)).toBeUndefined()
  })
})

describe('line endings and an empty deck', () => {
  it('writes the breaks with the line endings of the deck', () => {
    const raw = 'A\r\n\r\n---\r\n\r\nB\r\n\r\n---\r\n\r\nC\r\n'
    const after = applied(raw, moveStackEdit(raw, 'separator', 2, 0))
    expect(after).toBe('C\r\n\r\n---\r\n\r\nA\r\n\r\n---\r\n\r\nB\r\n')
    expect(applied(raw, duplicateEdit(raw, 'separator', 0, 0)).startsWith('A\r\n\r\n---\r\n\r\nA\r\n')).toBe(true)
  })

  it('gives an empty outline and no edit for an empty deck', () => {
    expect(deckOutline('---\ntitle: Vide\n---\n', 'heading')).toEqual([])
    expect(moveStackEdit('', 'heading', 0, 1)).toBeUndefined()
    expect(duplicateEdit('', 'separator', 0, 0)).toBeUndefined()
    expect(removeEdit('', 'heading', 0, 0)).toBeUndefined()
  })
})

describe('duplicateEdit', () => {
  it('copies a stack after it, or a vertical slide after itself', () => {
    expect(titles(applied(HEADING, duplicateEdit(HEADING, 'heading', 1, 0)), 'heading'))
      .toEqual(['0.0 Bilan', '1.0 Un', '1.1 Un bis', '2.0 Un', '2.1 Un bis', '3.0 Deux', '4.0 -'])
    expect(titles(applied(SEPARATOR, duplicateEdit(SEPARATOR, 'separator', 1, 1)), 'separator'))
      .toEqual(['0.0 Bilan', '1.0 Un', '1.1 Un bis', '1.2 Un bis', '2.0 Deux'])
    expect(titles(applied(SEPARATOR, duplicateEdit(SEPARATOR, 'separator', 2, 0)), 'separator'))
      .toEqual(['0.0 Bilan', '1.0 Un', '1.1 Un bis', '2.0 Deux', '3.0 Deux'])
  })

  it('refuses to copy the title slide of a heading deck', () => {
    expect(duplicateEdit(HEADING, 'heading', 0, 0)).toBeUndefined()
  })
})

describe('removeEdit', () => {
  it('removes a stack, the first one of a separator deck included, or a vertical slide', () => {
    expect(titles(applied(HEADING, removeEdit(HEADING, 'heading', 1, 0)), 'heading')).toEqual(['0.0 Bilan', '1.0 Deux', '2.0 -'])
    expect(titles(applied(HEADING, removeEdit(HEADING, 'heading', 1, 1)), 'heading')).toEqual(['0.0 Bilan', '1.0 Un', '2.0 Deux', '3.0 -'])
    for (const raw of [SEPARATOR, `---\ntitle: Essai\n---\n\n${SEPARATOR}`]) {
      const after = applied(raw, removeEdit(raw, 'separator', 0, 0))
      expect(titles(after, 'separator')).toEqual(['0.0 Un', '0.1 Un bis', '1.0 Deux'])
      expect(after.replace(/^---\ntitle: Essai\n---\n/, '').trimStart().startsWith('---')).toBe(false)
    }
    expect(titles(applied(SEPARATOR, removeEdit(SEPARATOR, 'separator', 1, 1)), 'separator')).toEqual(['0.0 Bilan', '1.0 Un', '2.0 Deux'])
  })

  it('places the caret on the next slide, or on the previous one after the last', () => {
    const middle = removeEdit(HEADING, 'heading', 1, 0)
    expect(applied(HEADING, middle).slice(middle!.anchor).startsWith('## Deux')).toBe(true)
    const last = removeEdit(HEADING, 'heading', 3, 0)
    expect(applied(HEADING, last).slice(last!.anchor).startsWith('## Deux')).toBe(true)
  })

  it('keeps one stack', () => {
    expect(removeEdit('## Seule\n\nTexte.', 'heading', 0, 0)).toBeUndefined()
  })
})

describe('renameChange', () => {
  const deck = '## Un\n\n---\n\n## Deux\n\n---\n\nTitre\nsouligné\n===\n'

  it('writes over the title the rename started from, as a title typed in its block', () => {
    expect(renameChange(deck, 'separator', 1, 0, 'Deux', 'Deux bis')).toEqual({ from: deck.indexOf('Deux'), to: deck.indexOf('Deux') + 4, insert: 'Deux bis' })
    expect(renameChange(deck, 'separator', 2, 0, 'Titre\nsouligné', '1. Bilan')).toMatchObject({ insert: '1\\. Bilan' })
  })

  it('refuses a title changed, or moved with its slide, in the meantime', () => {
    expect(renameChange(deck.replace('## Deux', '## Autre'), 'separator', 1, 0, 'Deux', 'Deux bis')).toBe('conflict')
    expect(renameChange(deck.replace('## Un\n\n---\n\n', ''), 'separator', 1, 0, 'Deux', 'Deux bis')).toBe('conflict')
    expect(renameChange('## Un\n', 'separator', 1, 0, 'Deux', 'Deux bis')).toBe('conflict')
  })
})
