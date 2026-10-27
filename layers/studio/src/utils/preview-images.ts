import type { ValueMention } from '@vignettes/core/deck'
import type { RevealApi } from 'reveal.js'
import { isRefusedEmbed, urlKindOf } from '@vignettes/core/deck'

/** Whether the browser loads the image at `src`, without decoding it. */
function loads(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = src
  })
}

/**
 * The addresses of the images of the slide on screen that the browser fails
 * to load: its `img` elements and its background image, as written in their
 * attributes. An `http://` address, which the studio refuses, has its own
 * problem in the editor.
 */
export async function missingImages(reveal: RevealApi): Promise<string[]> {
  const slide = reveal.getSlidesElement().querySelector('section.present:not(.stack)')
  if (!slide)
    return []
  const addresses = new Set<string>()
  for (const img of slide.querySelectorAll('img'))
    addresses.add(img.getAttribute('src') || img.getAttribute('data-src') || '')
  addresses.add(slide.getAttribute('data-background-image') || '')
  const checked = [...addresses].filter(src => src && !src.startsWith('data:') && !isRefusedEmbed('img', 'src', src))
  const loaded = await Promise.all(checked.map(loads))
  return checked.filter((_, index) => !loaded[index])
}

const fileName = (address: string) => address.split(/[?#]/)[0]!.split('/').pop()

/**
 * Where the source writes the address `src` of an image, among the attributes
 * that take an address outside links: the first mention from the line `from`
 * of its slide on, else before it; by its file name when the render rewrites
 * the address. Undefined for an address the source lacks, as a background of
 * the theme.
 */
export function imageMention(mentions: readonly ValueMention[], src: string, from: number): ValueMention | undefined {
  const addresses = mentions.filter(mention => mention.tag !== 'a' && urlKindOf(mention.tag, mention.name))
  for (const matches of [(value: string) => value === src, (value: string) => fileName(value) === fileName(src)]) {
    const found = addresses.filter(mention => matches(mention.value))
    const mention = found.find(at => at.line >= from) ?? found[0]
    if (mention)
      return mention
  }
  return undefined
}
