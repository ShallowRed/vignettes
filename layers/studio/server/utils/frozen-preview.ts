import type { H3Event } from 'h3'
import { readTitleSlide, titleSlidePreview } from '#shared/presentations'
import { splitFrontmatter } from '@vignettes/core/deck'
import { deckThemeName, resolveThemeName } from '@vignettes/core/theme'
import { publishedSource } from './sources'

/**
 * A frozen bundle is built without the link preview image, which the studio
 * renders. The page of a public bundle takes the image of its deck's title
 * slide, as `StudioDeck.vue` declares it on a live deck.
 */
export async function withPreviewImage(event: H3Event, page: string, deck: { slug: string, alias?: string | null }): Promise<string> {
  const raw = page.includes('property="og:image"') ? null : (await publishedSource.load(deck.slug))?.raw
  if (!raw)
    return page
  const { data } = splitFrontmatter(raw)
  const theme = resolveThemeName(deckThemeName(data))
  const { background: _, ...preview } = titleSlidePreview(readTitleSlide(raw), theme)
  const title = preview.title ?? (typeof data.title === 'string' ? data.title : deck.slug)
  const url = getOgImageUrl(event, deck.alias ? `/p/${deck.alias}` : `/slides/${deck.slug}`, { component: 'Deck', props: { ...preview, title } })
  return page.replace('</head>', `${previewImageTags(url)}</head>`)
}

/** The tags nuxt-og-image writes for an image of 1200 by 600 pixels. */
function previewImageTags(url: string): string {
  const content = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return [
    ['name', 'twitter:card', 'summary_large_image'],
    ['property', 'og:image', url],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '600'],
    ['name', 'twitter:image', url],
  ].map(([key, name, value]) => `<meta ${key}="${name}" content="${content(value!)}">`).join('')
}
