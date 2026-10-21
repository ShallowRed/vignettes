import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { imageDirectiveInsertion } from '../../layers/studio/src/utils/editor-commands'
import { imageUploadFailure } from '../../layers/studio/src/utils/image-upload-failure'

function insertAt(doc: string, at: number) {
  const state = EditorState.create({ doc })
  const next = state.update(imageDirectiveInsertion(state, at, '/media/abc.png')).state
  return { doc: next.doc.toString(), caret: next.selection.main.head }
}

describe('imageDirectiveInsertion', () => {
  it('inserts the directive at the caret of an empty line, the caret after it', () => {
    const doc = '# Title\n\n::Image{src="/media/abc.png" alt=""}\n::\n'
    expect(insertAt('# Title\n\n', 9)).toEqual({ doc, caret: doc.length })
  })

  it('opens a paragraph after text on the caret line', () => {
    expect(insertAt('Some text', 9).doc).toBe('Some text\n\n::Image{src="/media/abc.png" alt=""}\n::\n')
  })

  it('moves an insertion inside the frontmatter after it', () => {
    expect(insertAt('---\ntitle: T\n---\n', 5).doc).toBe('---\ntitle: T\n---\n\n::Image{src="/media/abc.png" alt=""}\n::\n\n')
  })
})

describe('imageUploadFailure', () => {
  const t = (key: string, named?: Record<string, unknown>) => `${key} ${JSON.stringify(named ?? {})}`
  const file = { name: 'plan.bmp', size: 12.34 * 2 ** 20 } as File
  const refused = (reason: string) => ({ data: { statusMessage: 'Server text', data: { reason } } })

  it('names the file and the accepted formats for a refused type', () => {
    expect(imageUploadFailure(refused('type'), file, t, 'fr')).toEqual({
      title: 'editor.imageUpload.failed {"name":"plan.bmp"}',
      description: 'editor.imageUpload.type {"formats":"PNG, JPG, WEBP, GIF, SVG, AVIF"}',
    })
  })

  it('gives the weight of the file and the limit for a refused size', () => {
    expect(imageUploadFailure(refused('size'), file, t, 'fr').description).toBe('editor.imageUpload.size {"size":"12,3","limit":10}')
  })

  it('names a storage failure', () => {
    expect(imageUploadFailure(refused('storage'), file, t, 'en').description).toBe('editor.imageUpload.storage {}')
  })

  it('shows the server message for another refusal, and none without an answer', () => {
    expect(imageUploadFailure({ data: { statusMessage: 'Forbidden' } }, file, t, 'en').description).toBe('Forbidden')
    expect(imageUploadFailure(new TypeError('Failed to fetch'), file, t, 'en').description).toBeUndefined()
  })
})
