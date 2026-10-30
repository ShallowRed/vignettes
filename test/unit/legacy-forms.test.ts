import type { TextChange } from '@vignettes/core/deck'
import { DeckMetaSchema, LEGACY_FORMS, LEGACY_FRONTMATTER_KEYS, legacyMentions, parserIdFor, RevealConfigSchema, splitFrontmatter, SyntaxConfigSchema } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

function converted(raw: string): string {
  const changes: TextChange[] = legacyMentions(raw).flatMap(mention => mention.changes).sort((a, b) => b.from - a.from)
  return changes.reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), raw)
}

describe('legacyMentions', () => {
  it('finds nothing in a deck written in the current format', () => {
    expect(legacyMentions('---\ntitle: A\nsyntax:\n  split: heading\nreveal:\n  transition: fade\n---\n\n# A\n\n:layout{media="right" src="/a.png"}\n')).toEqual([])
  })

  it('marks each earlier key on its name, in the order of the text', () => {
    const raw = '---\nparser: heading\naccess: public\ntransition: fade\ncenter: true\n---\n'
    expect(legacyMentions(raw).map(({ form, line, column, length }) => [form, line, column, length]))
      .toEqual([['parser', 2, 0, 6], ['access', 3, 0, 6], ['transition', 4, 0, 10], ['center', 5, 0, 6]])
  })

  it('writes parser as split under a new syntax key, with the same split', () => {
    const raw = '---\ntitle: A\nparser: heading\ntheme: dsfr\n---\n\n# A\n'
    const result = converted(raw)
    expect(result).toBe('---\ntitle: A\nsyntax:\n  split: heading\ntheme: dsfr\n---\n\n# A\n')
    expect(parserIdFor(splitFrontmatter(result).data)).toBe(parserIdFor(splitFrontmatter(raw).data))
  })

  it('adds the key under the block the deck writes, with its indent', () => {
    expect(converted('---\nreveal:\n    width: 1280\n\ntransition: fade\n---\n'))
      .toBe('---\nreveal:\n    width: 1280\n    transition: fade\n\n---\n')
  })

  it('removes the earlier key when the current one is written, which the reader prefers', () => {
    expect(converted('---\nparser: separator\nsyntax:\n  split: heading\nstatus: private\naccess: public\n---\n'))
      .toBe('---\nsyntax:\n  split: heading\nstatus: private\n---\n')
  })

  it('renames access to status, and removes center', () => {
    expect(converted('---\naccess: public # shared\ncenter: false\n---\n')).toBe('---\nstatus: public # shared\n---\n')
  })

  it('leaves a value written on the next lines, or under a flow mapping, for the author to convert', () => {
    const raw = '---\nsyntax: { split: heading }\nparser: heading\ntransition:\n  fade\n---\n'
    expect(legacyMentions(raw).map(mention => mention.changes)).toEqual([[], []])
  })

  it('writes the earlier attributes of :layout in their current form', () => {
    const raw = '## A\n\n:layout{name="media-right-wide" src="/a.png" previewWidth="1600"}\n\nTexte\n'
    expect(legacyMentions(raw)).toMatchObject([{ form: 'layout', line: 3, column: 0, length: 65 }])
    expect(converted(raw)).toBe('## A\n\n:layout{media="right" size="2/3" src="/a.png" viewport="1600"}\n\nTexte\n')
  })

  it('removes a :layout that converts into no attribute, with its line and the blank line after it', () => {
    expect(converted('## A\n\n:layout{name="full"}\n\nTexte\n')).toBe('## A\n\nTexte\n')
  })
})

describe('the registry of legacy forms', () => {
  it('converts each frontmatter key into a key the reader reads', () => {
    const nested: Record<string, object> = { syntax: SyntaxConfigSchema.shape, reveal: RevealConfigSchema.shape }
    for (const form of Object.values(LEGACY_FORMS).filter(form => LEGACY_FRONTMATTER_KEYS.includes(form.written) && form.current)) {
      const [root, child] = form.current!.split('.')
      expect(Object.hasOwn(DeckMetaSchema.shape, root!), form.current).toBe(true)
      if (child)
        expect(Object.hasOwn(nested[root!]!, child), form.current).toBe(true)
    }
  })
})
