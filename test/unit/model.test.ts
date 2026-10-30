import type { DeckModel } from '@vignettes/core/deck'
import { DECK_MODEL_VERSION, parseDeckModel, parserIdFor, serializeDeckModel } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

describe('deckModel IR serialization (audit §5.8)', () => {
  const model: DeckModel = {
    meta: { theme: 'brand', reveal: { margin: 0.2 } },
    slides: [
      { body: { type: 'root', children: [] }, headingLevel: 'h1' },
      { body: { type: 'root', children: [] }, layout: { media: { placement: 'right', size: '1/2', src: '/a.png', fit: 'cover', position: 'center', alt: '', lightbox: false, viewport: 1440 } } },
    ],
    assets: [{ kind: 'storybook', url: 'https://sb.example/iframe.html?id=x' }],
    provenance: { parser: 'separator', source: 'codimd' },
  }

  it('round-trips through serialize → parse', () => {
    expect(parseDeckModel(serializeDeckModel(model))).toEqual(model)
  })

  it('wraps the payload with a version', () => {
    const parsed = JSON.parse(serializeDeckModel(model))
    expect(parsed.version).toBe(DECK_MODEL_VERSION)
    expect(parsed.model.meta.theme).toBe('brand')
  })

  it('tolerates a bare (unwrapped) model for forward-compat', () => {
    expect(parseDeckModel(JSON.stringify(model))).toEqual(model)
  })
})

describe('parserIdFor', () => {
  it('selects the heading parser when requested', () => {
    expect(parserIdFor({ syntax: { split: 'heading' } })).toBe('heading')
  })

  it('reads the legacy root `parser` when `syntax.split` is absent', () => {
    expect(parserIdFor({ parser: 'heading' })).toBe('heading')
    expect(parserIdFor({ parser: 'heading', syntax: { split: 'separator' } })).toBe('separator')
  })

  it('defaults to the separator parser', () => {
    expect(parserIdFor({})).toBe('separator')
    expect(parserIdFor({ parser: undefined })).toBe('separator')
  })
})
