import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { decideMediaAccess } from '../../layers/studio/server/utils/access'
import { useDraftStore } from '../../layers/studio/server/utils/collab'
import { hashAccessPassword } from '../../layers/studio/server/utils/password'
import { useDeckMeta, useMediaIndex } from '../../layers/studio/server/utils/sources'
import { markdownToYDocUpdate } from '../../layers/studio/shared/collab/ydoc'
import { referencedMedia } from '../../layers/studio/shared/storage/media-refs'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'media-test-password-with-32-characters'

const { default: serveMedia } = await import('../../layers/studio/server/routes/media/[...path]')

/** A deck with the given status, carrying one image in its draft. */
async function deckWithImage(slug: string, status: 'public' | 'semi-private' | 'private', image: string, storedHash?: string) {
  await useDraftStore().save(slug, markdownToYDocUpdate(`# ${slug}\n\n![](/media/${image})`))
  await useDeckMeta().update(slug, { title: slug, status, ...(storedHash ? { accessPasswordHash: storedHash } : {}) })
}

/** A deck with the given status, showing one file of the content space. */
async function deckWithAsset(slug: string, status: 'public' | 'private', key: string) {
  await useDraftStore().save(slug, markdownToYDocUpdate(`# ${slug}\n\n![](/${key})`))
  await useDeckMeta().update(slug, { title: slug, status })
}

describe('referencedMedia', () => {
  it('collects the images of a document, uploads and content space alike, deduplicated', () => {
    const markdown = [
      '![](/media/abc123.png)',
      '::Image{src="/media/def456.webp"}',
      '![](/media/abc123.png)',
      '![](/images/atlas/carte.svg)',
      '![](/images/atlas/carte.svg)',
      '![](https://example.com/images/remote.png)',
    ].join('\n')
    expect(referencedMedia(markdown)).toEqual(['abc123.png', 'def456.webp', 'images/atlas/carte.svg'])
  })

  it('leaves the decoration of a theme alone', () => {
    const markdown = '::Slide{background="/backgrounds/as-title.png"}\n\n![](/pictograms/digital/application.svg)'
    expect(referencedMedia(markdown)).toEqual([])
  })

  it('finds nothing in a document without an image', () => {
    expect(referencedMedia('# Title\n\nSome text.')).toEqual([])
  })
})

describe('the media index', () => {
  it('keys an image to the deck whose draft references it', async () => {
    await deckWithImage('notes', 'private', 'abc123.png')
    expect(await useMediaIndex().decksFor('abc123.png')).toEqual(['notes'])
  })

  it('keeps the key when the image leaves the deck', async () => {
    await deckWithImage('notes', 'private', 'abc123.png')
    await useDraftStore().save('notes', markdownToYDocUpdate('# notes\n\nNo image any more.'))
    expect(await useMediaIndex().decksFor('abc123.png')).toEqual(['notes'])
  })
})

describe('decideMediaAccess', () => {
  it('serves an image of a public deck to anyone, cacheable', async () => {
    await deckWithImage('public-deck', 'public', 'abc123.png')
    expect(await decideMediaAccess(anon(), 'abc123.png')).toEqual({ allowed: true, public: true })
  })

  it('refuses an image of a private deck to an anonymous visitor', async () => {
    await deckWithImage('secret', 'private', 'abc123.png')
    expect(await decideMediaAccess(anon(), 'abc123.png')).toMatchObject({ allowed: false })
  })

  it('refuses an image of a semi-private deck until its password is given', async () => {
    await deckWithImage('locked', 'semi-private', 'abc123.png', await hashAccessPassword('open-sesame'))
    expect(await decideMediaAccess(anon(), 'abc123.png')).toMatchObject({ allowed: false })
  })

  it('serves it to an owner, privately', async () => {
    await seedAccount(1, 'boss', 'owner')
    await deckWithImage('secret', 'private', 'abc123.png')
    expect(await decideMediaAccess(asUser(1, 'boss'), 'abc123.png')).toEqual({ allowed: true, public: false })
  })

  it('serves an image a public deck also carries, without letting a shared cache keep it', async () => {
    await deckWithImage('secret', 'private', 'abc123.png')
    await deckWithImage('public-deck', 'public', 'abc123.png')
    expect(await decideMediaAccess(anon(), 'abc123.png')).toEqual({ allowed: true, public: false })
  })

  it('refuses an image no deck references', async () => {
    expect(await decideMediaAccess(anon(), 'unknown.png')).toEqual({ allowed: false, public: false })
  })

  it('refuses a file of the content space that only a private deck shows', async () => {
    await seedAccount(1, 'boss', 'owner')
    await deckWithAsset('client-work', 'private', 'images/client/plan.svg')
    expect(await decideMediaAccess(anon(), 'images/client/plan.svg')).toMatchObject({ allowed: false })
    expect(await decideMediaAccess(asUser(1, 'boss'), 'images/client/plan.svg')).toMatchObject({ allowed: true })
  })

  it('serves a file of the content space a public deck shows', async () => {
    await deckWithAsset('vitrine', 'public', 'images/panorama.svg')
    expect(await decideMediaAccess(anon(), 'images/panorama.svg')).toEqual({ allowed: true, public: true })
  })

  it('refuses a file of the content space no deck shows', async () => {
    expect(await decideMediaAccess(anon(), 'images/client/forgotten.png')).toMatchObject({ allowed: false })
  })

  it('refuses an image once its only deck is trashed', async () => {
    await deckWithImage('secret', 'public', 'abc123.png')
    await useDeckMeta().softDelete('secret')
    expect(await decideMediaAccess(anon(), 'abc123.png')).toMatchObject({ allowed: false })
  })
})

describe('the /media/** route', () => {
  it('answers 404 rather than naming the deck it belongs to', async () => {
    await deckWithImage('secret', 'private', 'abc123.png')
    await expect(serveMedia(anon({ params: { path: 'abc123.png' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 404 on an image no deck references', async () => {
    await expect(serveMedia(anon({ params: { path: 'abc123.png' } }))).rejects.toMatchObject({ statusCode: 404 })
  })
})
