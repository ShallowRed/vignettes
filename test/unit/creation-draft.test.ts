import { describe, expect, it } from 'vitest'
import { creationDraft, inFolder } from '../../layers/studio/server/utils/templates'

const IMPORTED = [
  '---',
  '# comment',
  'title: "Mon deck: essai"',
  'status: public',
  'project: ancien',
  'theme: dsfr',
  'reveal: { width: \'1280\' }',
  'date: 2026-11-27',
  '---',
  '',
  '',
  '# Titre',
  '',
  '![x](./img.png)',
  '',
].join('\n')

describe('the creation draft of a deck', () => {
  it('rewrites the frontmatter, removes status and puts the folder last', () => {
    expect(creationDraft(IMPORTED, { project: 'nouveau' })).toBe(
      '---\ntitle: \'Mon deck: essai\'\ntheme: dsfr\nreveal:\n  width: \'1280\'\ndate: \'2026-11-27\'\nproject: nouveau\n---\n\n# Titre\n\n![x](./img.png)\n',
    )
  })

  it('removes the project key without a folder', () => {
    expect(creationDraft(IMPORTED, {})).not.toMatch(/project/)
  })

  it('takes the title and the theme given at creation', () => {
    expect(creationDraft('---\ntitle: A\ntheme: dsfr\n---\n# A\n', { title: 'B', theme: 'minimal' })).toBe('---\ntitle: B\ntheme: minimal\n---\n\n# A\n')
  })

  it('leaves a text in the format of stringifyDocument unchanged, without status and with the key of its folder', () => {
    const pulled = '---\ntitle: Deck\nproject: cli\n---\n\n# Deck\n'
    expect(creationDraft(pulled, { project: 'cli' })).toBe(pulled)
  })
})

describe('inFolder', () => {
  it('names the folder in the project key, last, and removes the key without a folder', () => {
    expect(inFolder('---\nproject: old\ntitle: T\n---\n\n# T\n', 'new')).toBe('---\ntitle: T\nproject: new\n---\n\n# T\n')
    expect(inFolder('---\nproject: old\ntitle: T\n---\n\n# T\n')).toBe('---\ntitle: T\n---\n\n# T\n')
  })
})
