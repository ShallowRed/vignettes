import { EditorState } from '@codemirror/state'
import { sniffImageType } from '@vignettes/core/media'
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

  it('names a content that does not match its extension', () => {
    expect(imageUploadFailure(refused('content'), file, t, 'en').description).toBe('editor.imageUpload.content {}')
  })

  it('names a storage failure', () => {
    expect(imageUploadFailure(refused('storage'), file, t, 'en').description).toBe('editor.imageUpload.storage {}')
  })

  it('shows the server message for another refusal, and none without an answer', () => {
    expect(imageUploadFailure({ data: { statusMessage: 'Forbidden' } }, file, t, 'en').description).toBe('Forbidden')
    expect(imageUploadFailure(new TypeError('Failed to fetch'), file, t, 'en').description).toBeUndefined()
  })
})

describe('sniffImageType', () => {
  const bytes = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap(part => typeof part === 'string' ? [...new TextEncoder().encode(part)] : part))

  it('reads the signature of each binary format', () => {
    expect(sniffImageType(bytes([0x89], 'PNG\r\n\x1A\n', [0, 0]))).toBe('image/png')
    expect(sniffImageType(bytes([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg')
    expect(sniffImageType(bytes('GIF89a', [1, 0]))).toBe('image/gif')
    expect(sniffImageType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(bytes([0, 0, 0, 24], 'ftypmif1', [0, 0, 0, 0], 'mif1avif'))).toBe('image/avif')
  })

  it('finds the svg root after the XML prolog', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    expect(sniffImageType(bytes(svg))).toBe('image/svg+xml')
    expect(sniffImageType(bytes('\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n', svg))).toBe('image/svg+xml')
  })

  it('refuses text with another root, a doctype that declares entities, and unknown bytes', () => {
    expect(sniffImageType(bytes('<html><svg></svg></html>'))).toBeUndefined()
    expect(sniffImageType(bytes('<!DOCTYPE svg [<!ENTITY a "a">]><svg/>'))).toBeUndefined()
    expect(sniffImageType(bytes('<svgx/>'))).toBeUndefined()
    expect(sniffImageType(bytes('plain text'))).toBeUndefined()
    expect(sniffImageType(bytes('ftyp'))).toBeUndefined()
  })
})
