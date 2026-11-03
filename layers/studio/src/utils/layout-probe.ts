import type { RevealConfig } from '@vignettes/core/deck'

/**
 * The Reveal settings of the hidden render that measures the sizes of a media:
 * no keys, address, messages or pointer, and no transition, so that it leaves
 * the preview alone and shows each slide at once.
 */
export const PROBE_REVEAL_CONFIG = {
  embedded: true,
  hash: false,
  history: false,
  respondToHashChanges: false,
  keyboard: false,
  touch: false,
  mouseWheel: false,
  help: false,
  postMessage: false,
  postMessageEvents: false,
  focusBodyOnPageVisibilityChange: false,
  transition: 'none',
  backgroundTransition: 'none',
  fragments: false,
  scrollActivationWidth: null,
  controls: false,
  progress: false,
  slideNumber: false,
  autoPlayMedia: false,
} as const

/** The settings of the hidden render: the deck's own, under those of the probe. */
export function probeRevealConfig(reveal: Partial<RevealConfig> | undefined): Partial<RevealConfig> {
  return { ...reveal, ...PROBE_REVEAL_CONFIG }
}
