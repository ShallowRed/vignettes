import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPTURE_KEY_RE, captureKey, RECETTE_SUBJECT_RE, RECETTE_WIDTHS, recetteSubject } from '../../layers/studio/shared/recette/captures'
import { pruneSubject } from '../recette-capture/prune-subject'

describe('capture keys', () => {
  it('accepts every key that captureKey names', () => {
    for (const subject of ['essai', 'sections-dsfr', 'a1']) {
      for (const id of ['section-bleue', 'a', 'x-phone']) {
        for (const width of RECETTE_WIDTHS)
          expect(CAPTURE_KEY_RE.test(captureKey(subject, id, width)), captureKey(subject, id, width)).toBe(true)
      }
    }
  })

  it('refuses a key outside the captures', () => {
    for (const key of ['../x/a-desktop.png', 'x/a-tablet.png', 'x/a-desktop.png/..', 'x/A-desktop.png', 'x%2F../a-desktop.png', 'x.y/a-desktop.png', 'x/y/a-desktop.png', 'x/a-desktop.jpg', 'x/state.json', '/x/a-desktop.png'])
      expect(CAPTURE_KEY_RE.test(key), key).toBe(false)
  })

  it('takes the subject of a recette file whose name follows the rule of a subject, and of no other path', () => {
    expect(recetteSubject('test/recette/sections-dsfr.yaml')).toBe('sections-dsfr')
    for (const path of ['test/recette/a.b.yaml', 'test/recette/A.yaml', 'test/recette/a b.yaml', 'test/recette/decks/a.yaml', 'test/recette/a.yml', 'recette/a.yaml'])
      expect(recetteSubject(path), path).toBeUndefined()
    expect(RECETTE_SUBJECT_RE.test('sections-dsfr')).toBe(true)
    expect(RECETTE_SUBJECT_RE.test('-a')).toBe(false)
  })
})

describe('pruning a subject', () => {
  it('removes the captures of the questions missing from the file, and nothing else', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recette-captures-'))
    try {
      const names = ['essai/a-desktop.png', 'essai/a-phone.png', 'essai/retiree-desktop.png', 'essai/state.json', 'essai/notes.txt', 'autre/retiree-desktop.png']
      for (const name of names) {
        mkdirSync(join(dir, name, '..'), { recursive: true })
        writeFileSync(join(dir, name), 'x')
      }
      await pruneSubject(dir, 'essai', ['a'])
      expect(names.filter(name => existsSync(join(dir, name)))).toEqual(['essai/a-desktop.png', 'essai/a-phone.png', 'essai/state.json', 'essai/notes.txt', 'autre/retiree-desktop.png'])
      await expect(pruneSubject(dir, '../autre', [])).rejects.toThrow('not a recette subject')
      await pruneSubject(dir, 'absent', [])
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
