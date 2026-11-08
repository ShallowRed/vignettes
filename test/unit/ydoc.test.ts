import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DraftLineageError, editDraftUpdate, followDraftUpdate, includesState, isDeckTextUpdate, markdownToYDocUpdate, mergeDraftUpdate, replaceText, sharesLineage, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'

describe('deck ydoc helpers', () => {
  it('round-trips markdown through a Y.Doc update', () => {
    const raw = '---\ntitle: T\n---\n\n# Un deck\n\nAvec des accents é à ü.'
    expect(yDocUpdateToMarkdown(markdownToYDocUpdate(raw))).toBe(raw)
  })

  it('handles the empty document', () => {
    expect(yDocUpdateToMarkdown(markdownToYDocUpdate(''))).toBe('')
  })
})

function docWith(...texts: string[]) {
  const doc = new Y.Doc()
  for (const text of texts)
    doc.getText('codemirror').insert(0, text)
  return doc
}

describe('sharesLineage', () => {
  it('tells a document from the one it synced with, and from one built apart', () => {
    const room = docWith('# v1')
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(room))
    tab.getText('codemirror').insert(0, '# edited\n')
    expect(sharesLineage(Y.encodeStateVector(tab), Y.encodeStateVector(room))).toBe(true)
    expect(sharesLineage(Y.encodeStateVector(docWith('# v1')), Y.encodeStateVector(room))).toBe(false)
  })

  it('takes an empty state vector for any lineage', () => {
    expect(sharesLineage(Y.encodeStateVector(new Y.Doc()), Y.encodeStateVector(docWith('# v1')))).toBe(true)
    expect(sharesLineage(Y.encodeStateVector(docWith('# v1')), Y.encodeStateVector(new Y.Doc()))).toBe(true)
  })
})

describe('replaceText', () => {
  it.each([
    ['# a\nb\nc', '# a\nB\nc'],
    ['abc', ''],
    ['', 'abc'],
    ['ab👍cd', 'ab👎cd'],
    ['same', 'same'],
  ])('turns %j into %j', (from, to) => {
    const doc = docWith(from)
    replaceText(doc.getText('codemirror'), to)
    expect(doc.getText('codemirror').toString()).toBe(to)
  })

  it('keeps the items around the change, so a concurrent edit there stays once', () => {
    const room = docWith('# title\n\nbody')
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(room))
    tab.getText('codemirror').insert(0, '! ')
    replaceText(room.getText('codemirror'), '# title\n\nnew body')
    Y.applyUpdate(room, Y.encodeStateAsUpdate(tab))
    expect(room.getText('codemirror').toString()).toBe('! # title\n\nnew body')
  })
})

describe('includesState', () => {
  it('tells whether a stored update holds what a state vector counts', () => {
    const doc = docWith('# v1')
    const written = Y.encodeStateVector(doc)
    expect(includesState(Y.encodeStateAsUpdate(doc), written)).toBe(true)
    expect(includesState(Y.encodeStateAsUpdate(new Y.Doc()), written)).toBe(false)
  })

  it('holds a write that a concurrent edit followed', () => {
    const doc = docWith('# v1')
    const written = Y.encodeStateVector(doc)
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(doc))
    tab.getText('codemirror').insert(0, '! ')
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(tab))
    expect(includesState(Y.encodeStateAsUpdate(doc), written)).toBe(true)
  })
})

describe('mergeDraftUpdate', () => {
  const state = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc)

  it('refuses no stored draft, an empty update over one, and another lineage', () => {
    const stored = state(docWith('# v1'))
    expect(() => mergeDraftUpdate(null, stored)).toThrow(DraftLineageError)
    expect(() => mergeDraftUpdate(stored, state(new Y.Doc()))).toThrow(DraftLineageError)
    expect(() => mergeDraftUpdate(stored, state(docWith('# v1')))).toThrow(DraftLineageError)
  })

  it('merges a room of the lineage with what only the stored draft holds', () => {
    const base = docWith('# v1')
    const room = new Y.Doc()
    Y.applyUpdate(room, state(base))
    room.getText('codemirror').insert(0, 'room ')
    base.getText('codemirror').insert(4, ' stored')
    expect(yDocUpdateToMarkdown(mergeDraftUpdate(state(base), state(room)))).toBe('room # v1 stored')
  })

  it('keeps the deleted text out of the stored draft', () => {
    const text = 'x'.repeat(2000)
    const room = docWith(text)
    let stored = state(room)
    for (let i = 0; i < 50; i++) {
      replaceText(room.getText('codemirror'), `${i % 2 ? 'a' : 'b'}${text}`)
      stored = mergeDraftUpdate(stored, state(room))
    }
    expect(yDocUpdateToMarkdown(stored)).toBe(`a${text}`)
    expect(stored.byteLength).toBeLessThan(text.length + 50 * 40)
  })
})

describe('followDraftUpdate', () => {
  it('follows a draft that holds the replaced version, in its lineage, and leaves one with other text', () => {
    const draft = docWith('# v1')
    const followed = followDraftUpdate(Y.encodeStateAsUpdate(draft), '# v1', '# v2')!
    expect(yDocUpdateToMarkdown(followed)).toBe('# v2')
    expect(sharesLineage(Y.encodeStateVectorFromUpdate(followed), Y.encodeStateVector(draft))).toBe(true)
    expect(followDraftUpdate(Y.encodeStateAsUpdate(docWith('# edited')), '# v1', '# v2')).toBeNull()
    expect(followDraftUpdate(Y.encodeStateAsUpdate(docWith('# draft')), null, '# v1')).toBeNull()
    expect(followDraftUpdate(Y.encodeStateAsUpdate(docWith('# v2')), '# v1', '# v2')).toBeNull()
  })
})

describe('editDraftUpdate', () => {
  it('edits the text of the draft in its lineage, and returns null when the edit changes nothing', () => {
    const draft = docWith('theme: dsfr')
    const edited = editDraftUpdate(Y.encodeStateAsUpdate(draft), (text) => {
      text.delete(7, 4)
      text.insert(7, 'kit')
      return true
    })!
    expect(yDocUpdateToMarkdown(edited)).toBe('theme: kit')
    expect(sharesLineage(Y.encodeStateVectorFromUpdate(edited), Y.encodeStateVector(draft))).toBe(true)
    expect(editDraftUpdate(Y.encodeStateAsUpdate(draft), () => false)).toBeNull()
  })
})

describe('isDeckTextUpdate', () => {
  it('accepts the text an editor types and deletes, and the state of the draft', () => {
    const room = docWith('# v1\n\nCorps')
    const before = Y.encodeStateVector(room)
    room.getText('codemirror').insert(4, ' et v2')
    room.getText('codemirror').delete(0, 2)
    expect(isDeckTextUpdate(Y.encodeStateAsUpdate(room, before))).toBe(true)
    expect(isDeckTextUpdate(Y.encodeStateAsUpdate(room))).toBe(true)
    expect(isDeckTextUpdate(Y.encodeStateAsUpdate(new Y.Doc()))).toBe(true)
  })

  it('refuses another shared type, an embed, a format and an attribute of the text', () => {
    const changes: ((doc: Y.Doc) => void)[] = [
      doc => doc.getMap('other').set('key', 'x'),
      doc => doc.getText('other').insert(0, 'x'),
      doc => doc.getText('codemirror').insertEmbed(0, { image: 'x' }),
      doc => doc.getText('codemirror').insertEmbed(0, new Y.Map()),
      doc => doc.getText('codemirror').format(0, 2, { bold: true }),
      doc => doc.getText('codemirror').insert(0, 'x', { bold: true }),
    ]
    for (const change of changes) {
      const room = docWith('# v1')
      const before = Y.encodeStateVector(room)
      change(room)
      expect(isDeckTextUpdate(Y.encodeStateAsUpdate(room, before))).toBe(false)
    }
  })
})
