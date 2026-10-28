import { deckAttributes, isDeckUrl, isRefusedEmbed, isRefusedEmbedUrl, parseDeckMeta, readAttribute, readLayout, urlKindOf } from '@vignettes/core/deck'
import { buildStoryUrl, EMBED_SANDBOX, embedSandbox, resolveSlideMedia } from '@vignettes/core/render'
import { describe, expect, it } from 'vitest'

describe('isDeckUrl', () => {
  it.each([
    'https://storybook.example.com',
    'http://localhost:6006/',
    '/images/a.png',
    './a.png',
    '../a.png',
    'a.png',
    '#/slide',
    '?page=2',
    '/frozen/talk/_storybook',
  ])('accepts %s', (url) => {
    expect(isDeckUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\u0001javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:application/xhtml+xml,<x/>',
    'data:image/svg+xml,<svg onload="alert(1)"/>',
    'blob:https://example.com/1',
    'file:///etc/passwd',
    '//evil.example',
    '\\\\evil.example',
    '/\\evil.example',
    'https://',
  ])('refuses %j', (url) => {
    expect(isDeckUrl(url)).toBe(false)
  })

  it('takes a data:image URL for an image only', () => {
    expect(isDeckUrl('data:image/png;base64,iVBORw0KGgo=', 'image')).toBe(true)
    expect(isDeckUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
    expect(isDeckUrl('data:text/html;base64,PHNjcmlwdD4=', 'image')).toBe(false)
  })

  it('refuses what is not a string', () => {
    expect(isDeckUrl(undefined)).toBe(false)
    expect(isDeckUrl(1)).toBe(false)
  })
})

describe('isRefusedEmbedUrl', () => {
  it('refuses an http address of another machine', () => {
    for (const url of ['http://example.com/a.png', 'HTTP://example.com', ' http://192.168.1.2:6006'])
      expect(isRefusedEmbedUrl(url)).toBe(true)
  })

  it('takes https, the presenter machine over http, and the paths of the site', () => {
    for (const url of ['https://example.com', 'http://localhost:6006/', 'http://127.0.0.1/a.png', '/images/a.png', 'a.png', undefined])
      expect(isRefusedEmbedUrl(url)).toBe(false)
  })

  it('applies to what the page loads, a link excepted', () => {
    expect(isRefusedEmbed('iframe', 'src', 'http://example.com')).toBe(true)
    expect(isRefusedEmbed('quote', 'avatar', 'http://example.com/a.png')).toBe(true)
    expect(isRefusedEmbed('a', 'href', 'http://example.com')).toBe(false)
    expect(isRefusedEmbed('quote', 'author', 'http://example.com')).toBe(false)
  })
})

describe('the storybook frontmatter key', () => {
  it('takes an address of the rule', () => {
    expect(parseDeckMeta({ storybook: 'https://storybook.example.com' }).valid).toBe(true)
  })

  it('refuses a script address with a message', () => {
    const { valid, issues } = parseDeckMeta({ storybook: 'javascript:alert(1)' })
    expect(valid).toBe(false)
    expect(issues).toEqual(['storybook: Expected an http:// or https:// address, or a path on this site'])
  })
})

describe('readAttribute', () => {
  it('knows the attributes that take an address, and the image ones', () => {
    expect(urlKindOf('a', 'href')).toBe('page')
    expect(urlKindOf('a', 'dataPreviewLink')).toBe('page')
    expect(urlKindOf('img', 'src')).toBe('image')
    expect(urlKindOf('deck-image', 'src')).toBe('image')
    expect(urlKindOf('quote', 'avatar')).toBe('image')
    expect(urlKindOf('slide-background', 'image')).toBe('image')
    expect(urlKindOf('iframe', 'src')).toBe('page')
    expect(urlKindOf('quote', 'author')).toBeUndefined()
  })

  it('keeps the JSON value of a bound attribute under its plain name', () => {
    expect(readAttribute('scheme', ':fragments', 'false')).toEqual({ name: 'fragments', value: false })
    expect(readAttribute('step', 'v-bind:step', '2')).toEqual({ name: 'step', value: 2 })
    expect(readAttribute('json-tour', ':zones', '[1,2]')).toEqual({ name: 'zones', value: [1, 2] })
  })

  it('refuses a bound attribute that reads the page data', () => {
    expect(readAttribute('iframe', ':src', 'storybook')).toEqual({ refused: 'binding' })
    expect(readAttribute('a', ':href', '$route.matched')).toEqual({ refused: 'binding' })
  })

  it('checks the address a bound attribute gives', () => {
    expect(readAttribute('iframe', ':src', '"javascript:alert(1)"')).toEqual({ refused: 'url' })
    expect(readAttribute('iframe', ':src', '"\\u006aavascript:alert(1)"')).toEqual({ refused: 'url' })
    expect(readAttribute('iframe', ':src', '"https://example.com"')).toEqual({ name: 'src', value: 'https://example.com' })
  })

  it('keeps no key or name that reaches a prototype', () => {
    const reading = readAttribute('scheme', ':x', '{"__proto__":{"p":1},"constructor":2,"a":{"prototype":3,"b":4}}')
    expect(reading).toEqual({ name: 'x', value: { a: { b: 4 } } })
    expect(Object.hasOwn((reading as { value: object }).value, '__proto__')).toBe(false)
    for (const name of [':__proto__', '__proto__', ':constructor', 'prototype'])
      expect(readAttribute('a', name, '1')).toEqual({ refused: 'binding' })
  })

  it('refuses the directives', () => {
    for (const name of ['v-bind', 'v-on:click', '@click', 'v-model', 'v-model:value'])
      expect(readAttribute('a', name, 'x')).toEqual({ refused: 'binding' })
  })

  it('refuses markup characters in an address of Reveal\'s overlay', () => {
    expect(readAttribute('a', 'data-preview-link', 'https://example.com/"><b>')).toEqual({ refused: 'url' })
    expect(readAttribute('a', 'data-preview-image', '/media/a<b.png')).toEqual({ refused: 'url' })
    expect(readAttribute('a', 'data-preview-link', 'https://example.com/?q=a')).toEqual({ name: 'data-preview-link', value: 'https://example.com/?q=a' })
  })

  it('refuses an SVG animation of an address, and keeps the others', () => {
    expect(readAttribute('animate', 'attributeName', 'href')).toEqual({ refused: 'url' })
    expect(readAttribute('set', 'attributeName', 'xlink:href')).toEqual({ refused: 'url' })
    expect(readAttribute('animate', 'attributeName', 'opacity')).toEqual({ name: 'attributeName', value: 'opacity' })
  })

  it('keeps the attributes outside the rule and the slots', () => {
    expect(deckAttributes('template', { 'v-slot:title': '' })).toEqual({ 'v-slot:title': '' })
    expect(deckAttributes('a', { href: 'javascript:alert(1)', title: 't', dataPreviewLink: 'javascript:x' })).toEqual({ title: 't' })
  })
})

describe('story and media addresses', () => {
  it('builds no story address from a base outside the rule', () => {
    expect(buildStoryUrl('javascript:alert(1)', 'a--b')).toBeUndefined()
    expect(buildStoryUrl('https://sb.example', 'a--b')).toBe('https://sb.example/iframe.html?id=a--b&viewMode=story')
    expect(buildStoryUrl('https://sb.example', 'a&b=c')).toBe('https://sb.example/iframe.html?id=a%26b%3Dc&viewMode=story')
  })

  it('keeps the folder of a Storybook address copied from the browser bar', () => {
    const story = 'https://sb.example/main/iframe.html?id=a--b&viewMode=story'
    expect(buildStoryUrl('https://sb.example/main/?path=/story/c--d', 'a--b')).toBe(story)
    expect(buildStoryUrl('https://sb.example/main/index.html?path=/story/c--d', 'a--b')).toBe(story)
    expect(buildStoryUrl('https://sb.example/main/iframe.html', 'a--b')).toBe(story)
  })

  it('gives no media for a story of a refused base or a refused source', () => {
    const media = (attributes: Record<string, unknown>) => readLayout({ media: 'right', ...attributes }).layout.media
    expect(resolveSlideMedia(media({ story: 'a--b' }), { storybook: 'javascript:alert(1)' })).toBeNull()
    expect(resolveSlideMedia(media({ src: 'data:text/html,<script>alert(1)</script>' }))).toBeNull()
    expect(resolveSlideMedia(media({ src: '/a.png' }))?.src).toBe('/a.png')
  })
})

describe('embedSandbox', () => {
  const origin = 'https://studio.example'

  it('keeps the origin of a page of another site', () => {
    expect(embedSandbox('https://sb.example/iframe.html', origin)).toBe(EMBED_SANDBOX)
  })

  it('keeps the origin of a page the studio serves: a deck, a frozen bundle and its Storybook', () => {
    for (const src of ['/slides/demo', 'https://studio.example/frozen/talk/_storybook/iframe.html?id=a--b', '/frozen/talk/'])
      expect(embedSandbox(src, origin)).toBe(EMBED_SANDBOX)
  })

  it('runs a file an account uploaded in an opaque origin', () => {
    for (const src of ['/media/x.svg', 'https://studio.example/media/x.html', '/MEDIA/x.svg', '/slides/../media/x.svg', '/%6Dedia/x.svg']) {
      const tokens = embedSandbox(src, origin).split(' ')
      expect(tokens, src).toContain('allow-scripts')
      expect(tokens, src).not.toContain('allow-same-origin')
    }
    expect(embedSandbox('https://other.example/media/x.svg', origin)).toBe(EMBED_SANDBOX)
  })
})
