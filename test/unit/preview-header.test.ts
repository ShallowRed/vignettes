import { describe, expect, it } from 'vitest'
import { previewSourceReader } from '../../layers/studio/src/utils/preview-header'

describe('previewSourceReader', () => {
  it('gives a text whose header parses as it is', () => {
    const text = '---\ntitle: Bilan\ntheme: minimal\n---\n\n# Bilan\n'
    expect(previewSourceReader()(text)).toBe(text)
  })

  it('keeps the last readable header but its parser while the header does not parse', () => {
    const source = previewSourceReader()
    source('---\ntitle: Bilan\ntheme: minimal\nparser: separator\nreveal:\n  width: 1440\n---\n\n# Bilan\n')
    expect(source('---\ntitle: Bilan : octobre\ntheme: minimal\n---\n\n# Bilan\n')).toBe('---\ntitle: Bilan\ntheme: minimal\nreveal:\n  width: 1440\n---\n\n\n# Bilan\n')
  })

  it('gives the body alone when no header has parsed yet', () => {
    expect(previewSourceReader()('---\ntitle: Bilan : octobre\n---\n\n# Bilan\n')).toBe('\n# Bilan\n')
  })
})
