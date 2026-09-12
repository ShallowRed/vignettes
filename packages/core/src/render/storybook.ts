// Pure Storybook embed URL helpers, shared by the renderer and tests.

export interface StoryUrlOptions {
  /** Reveal Storybook UI chrome (toolbar) instead of the bare canvas. */
  full?: boolean
  /** Extra Storybook globals, e.g. `{ backgrounds: '!hex(fff)' }`. */
  globals?: Record<string, string>
}

/** Returns the `iframe.html?id=…` URL, or undefined when base/story missing. */
export function buildStoryUrl(
  base?: string,
  story?: string,
  options: StoryUrlOptions = {},
): string | undefined {
  if (!base || !story)
    return undefined
  const clean = base.replace(/\/+$/, '')
  const path = options.full ? 'index.html?path=/story' : 'iframe.html?id'
  const sep = options.full ? '/' : '='
  const params = new URLSearchParams()
  if (!options.full)
    params.set('viewMode', 'story')
  if (options.globals && Object.keys(options.globals).length > 0) {
    const globals = Object.entries(options.globals)
      .map(([k, v]) => `${k}:${v}`)
      .join(';')
    params.set('globals', globals)
  }
  const query = params.toString()
  return `${clean}/${path}${sep}${story}${query ? `&${query}` : ''}`
}

// Named aspect ratios plus passthrough for raw `w/h`; returns a CSS aspect-ratio.
export function resolveAspectRatio(ratio?: string): string | undefined {
  if (!ratio)
    return undefined
  const named: Record<string, string> = {
    desktop: '16 / 10',
    wide: '16 / 9',
    classic: '4 / 3',
    photo: '3 / 2',
    square: '1 / 1',
    mobile: '9 / 16',
    portrait: '3 / 4',
  }
  if (named[ratio])
    return named[ratio]
  if (/^\d+\s*\/\s*\d+$/.test(ratio))
    return ratio.replace(/\s+/g, ' ')
  return undefined
}
