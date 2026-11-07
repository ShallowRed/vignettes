import type { MediaLayout, MediaPosition } from '../deck/layout.ts'
import type { AssetRef, DeckModel, Slide } from '../deck/model.ts'
import type { DeckMeta, ThemeBackgrounds } from '../deck/schema.ts'
import { inferMediaType } from '../deck/layout.ts'
import { surfaceLevel } from '../deck/model.ts'
import { isDeckUrl } from '../deck/urls.ts'
import { getThemeTokens } from '../theme/tokens.ts'
import { deckBrand } from './brand.ts'
import { buildStoryUrl } from './storybook.ts'

// Named, pure, composable transform steps over the deck model: media resolution,
// background resolution, asset collection, and the pipeline runner.

export interface SlideMedia {
  src: string
  type: 'iframe' | 'image'
  alt: string
  fit: 'cover' | 'contain'
  position: MediaPosition
  scaled: boolean
  interactive: boolean
  viewport: number
  hasLightbox: boolean
  hint?: string
  previewLink?: string
  previewImage?: string
}

/** The address a media pane loads: the story in the deck's Storybook, or `src`. */
function mediaSource(media: MediaLayout, storybook?: string): string | undefined {
  return media.story ? buildStoryUrl(storybook, media.story) : media.src
}

/**
 * The media pane of a slide. Returns null when the slide has no pane (no media,
 * or a media behind the text), or when its address is outside `isDeckUrl`.
 */
export function resolveSlideMedia(
  media: MediaLayout | undefined,
  opts: { storybook?: string } = {},
): SlideMedia | null {
  if (!media || media.placement === 'behind')
    return null
  const src = mediaSource(media, opts.storybook)
  if (!src)
    return null

  const type = inferMediaType(src, media.type, Boolean(media.story))
  if (!isDeckUrl(src, type === 'image' ? 'image' : 'page'))
    return null
  const scaled = type === 'iframe' && media.fit !== 'contain'

  return {
    src,
    type,
    alt: media.alt,
    fit: media.fit,
    position: media.position,
    scaled,
    // Without a lightbox, a scaled story embed is interactive in place.
    interactive: scaled && !media.lightbox,
    viewport: media.viewport,
    hasLightbox: media.lightbox,
    hint: media.hint,
    previewLink: (media.lightbox && type === 'iframe') ? src : undefined,
    previewImage: (media.lightbox && type !== 'iframe') ? src : undefined,
  }
}

/** The image a slide lays behind its text with `:layout{media="behind"}`, when its address is an image address. */
export function behindMedia(slide: Pick<Slide, 'layout'>): MediaLayout | undefined {
  const media = slide.layout?.media
  return media?.placement === 'behind' && isDeckUrl(media.src, 'image') ? media : undefined
}

// Precedence: media behind the text → slide-level backgroundImage override →
// deck frontmatter backgrounds map → theme tokens' background for the slide's
// `surfaceLevel`.
export function resolveSlideBackground(
  slide: Pick<Slide, 'headingLevel' | 'section' | 'backgroundImage' | 'layout'>,
  theme?: string,
  customBackgrounds?: ThemeBackgrounds,
): string | undefined {
  const behind = behindMedia(slide)
  if (behind)
    return behind.src
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
// layout media, backgrounds, the operator's logo) so a renderer can rebase them
// all in one place.
export function collectAssets(slides: Slide[], meta: Pick<DeckMeta, 'storybook' | 'theme' | 'backgrounds' | 'brand'>): AssetRef[] {
  const assets: AssetRef[] = []
  const seen = new Set<string>()
  const push = (kind: AssetRef['kind'], url: string | undefined, origin: string) => {
    if (!url || seen.has(`${kind}:${url}`))
      return
    seen.add(`${kind}:${url}`)
    assets.push({ kind, url, origin })
  }

  const visit = (slide: Slide, origin: string) => {
    const media = resolveSlideMedia(slide.layout?.media, { storybook: meta.storybook })
    if (media) {
      if (media.type === 'iframe')
        push(slide.layout?.media?.story ? 'storybook' : 'iframe', media.src, origin)
      else
        push('image', media.src, origin)
    }
    push('image', resolveSlideBackground(slide, meta.theme, meta.backgrounds), `${origin}/background`)
    slide.verticalSlides?.forEach((vs, i) => visit(vs, `${origin}/v${i}`))
  }

  slides.forEach((slide, i) => visit(slide, `slide[${i}]`))
  push('image', deckBrand(meta)?.operator?.src, 'brand/operator')
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
