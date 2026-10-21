import type { AssetRef, DeckModel, Slide } from '../deck/model.ts'
import type { DeckMeta, ThemeBackgrounds } from '../deck/schema.ts'
import { surfaceLevel } from '../deck/model.ts'
import { isDeckUrl } from '../deck/urls.ts'
import { getThemeTokens } from '../theme/tokens.ts'
import { buildStoryUrl } from './storybook.ts'

// Named, pure, composable transform steps over the deck model: media resolution,
// background resolution, asset collection, and the pipeline runner.

export interface SlideMedia {
  src: string
  type: 'iframe' | 'image'
  title: string
  alt: string
  fit: 'cover' | 'contain'
  scaled: boolean
  interactive: boolean
  previewWidth: number
  hasLightbox: boolean
  hint?: string
  previewLink?: string
  previewImage?: string
}

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp|avif)(?:[?#]|$)/i

/**
 * Whether a media source is shown as a page or an image. An explicit `type` or a
 * story decides; otherwise a URL ending with an image extension is an image, and
 * any other URL a page.
 */
export function inferMediaType(src: string, type?: string, story?: boolean): 'iframe' | 'image' {
  if (type === 'iframe' || type === 'image')
    return type
  if (story)
    return 'iframe'
  return IMAGE_EXTENSION.test(src) ? 'image' : 'iframe'
}

/** `contain` only when explicitly asked, else `cover`. */
export function getMediaFit(layoutProps?: Record<string, string>): 'cover' | 'contain' {
  return layoutProps?.fit === 'contain' ? 'contain' : 'cover'
}

/** Returns null when the slide has no media, or when its address is outside `isDeckUrl`. */
export function resolveSlideMedia(
  layoutProps: Record<string, string> | undefined,
  opts: { storybook?: string } = {},
): SlideMedia | null {
  const lp = layoutProps
  if (!lp)
    return null

  const storySrc = lp.story ? buildStoryUrl(opts.storybook, lp.story) : undefined
  const src = storySrc ?? lp.src
  if (!src)
    return null

  const type = inferMediaType(src, lp.type, Boolean(storySrc))
  if (!isDeckUrl(src, type === 'image' ? 'image' : 'page'))
    return null
  const fit = getMediaFit(lp)
  // MDC kebab-cases camelCase attribute keys, so `previewWidth="1600"` arrives as
  // `preview-width` — check that first, with camel/lower forms as fallbacks.
  const previewWidthRaw = lp['preview-width'] ?? lp.previewWidth ?? lp.previewwidth
  const parsed = previewWidthRaw ? Number.parseInt(previewWidthRaw, 10) : 1440
  const previewWidth = Number.isFinite(parsed) && parsed > 0 ? parsed : 1440
  const scaled = type === 'iframe' && lp.raw == null && fit !== 'contain'
  const hasLightbox = Boolean(lp.lightbox)

  return {
    src,
    type,
    title: lp.title || '',
    alt: lp.alt || '',
    fit,
    scaled,
    // Without a lightbox, a scaled story embed is interactive in place.
    interactive: scaled && !hasLightbox,
    previewWidth,
    hasLightbox,
    hint: lp.hint || undefined,
    previewLink: (lp.lightbox && type === 'iframe') ? src : undefined,
    previewImage: (lp.lightbox && type !== 'iframe') ? src : undefined,
  }
}

// Precedence: slide-level backgroundImage override → deck frontmatter
// backgrounds map → theme tokens' background for the slide's `surfaceLevel`.
export function resolveSlideBackground(
  slide: Pick<Slide, 'headingLevel' | 'section' | 'backgroundImage'>,
  theme?: string,
  customBackgrounds?: ThemeBackgrounds,
): string | undefined {
  if (slide.backgroundImage)
    return slide.backgroundImage
  const backgrounds = customBackgrounds ?? getThemeTokens(theme)?.backgrounds
  if (!backgrounds)
    return undefined
  const level = surfaceLevel(slide) as keyof ThemeBackgrounds | undefined
  // The schema accepts keys it does not name, so a value read by level is not a
  // string by construction.
  const named = level ? backgrounds[level] : undefined
  return typeof named === 'string' ? named : backgrounds.default
}

// Collect the external assets a deck's slides reference (storybook iframes,
// layout media, backgrounds) so a renderer can rebase them all in one place.
export function collectAssets(slides: Slide[], meta: Pick<DeckMeta, 'storybook' | 'theme' | 'backgrounds'>): AssetRef[] {
  const assets: AssetRef[] = []
  const seen = new Set<string>()
  const push = (kind: AssetRef['kind'], url: string | undefined, origin: string) => {
    if (!url || seen.has(`${kind}:${url}`))
      return
    seen.add(`${kind}:${url}`)
    assets.push({ kind, url, origin })
  }

  const visit = (slide: Slide, origin: string) => {
    const media = resolveSlideMedia(slide.layoutProps, { storybook: meta.storybook })
    if (media) {
      if (media.type === 'iframe')
        push(slide.layoutProps?.story ? 'storybook' : 'iframe', media.src, origin)
      else
        push('image', media.src, origin)
    }
    push('image', resolveSlideBackground(slide, meta.theme, meta.backgrounds), `${origin}/background`)
    slide.verticalSlides?.forEach((vs, i) => visit(vs, `${origin}/v${i}`))
  }

  slides.forEach((slide, i) => visit(slide, `slide[${i}]`))
  return assets
}

export interface DeckTransform {
  readonly name: string
  apply: (model: DeckModel) => DeckModel
}

export function runTransforms(model: DeckModel, transforms: readonly DeckTransform[]): DeckModel {
  return transforms.reduce((acc, t) => t.apply(acc), model)
}

export const collectAssetsTransform: DeckTransform = {
  name: 'collect-assets',
  apply: model => ({ ...model, assets: collectAssets(model.slides, model.meta) }),
}

export const DEFAULT_TRANSFORMS: readonly DeckTransform[] = [collectAssetsTransform]

// Build a normalized DeckModel (IR) from resolved meta + parsed slides, running
// the named transform pipeline.
export function buildDeckModel(
  meta: DeckMeta,
  slides: Slide[],
  options: { parser?: string, source?: string, transforms?: readonly DeckTransform[] } = {},
): DeckModel {
  const base: DeckModel = {
    meta,
    slides,
    assets: [],
    provenance: { parser: options.parser ?? 'separator', source: options.source },
  }
  return runTransforms(base, options.transforms ?? DEFAULT_TRANSFORMS)
}
