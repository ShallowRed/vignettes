/**
 * The features on trial, which `server/plugins/trials.ts` opens. A feature
 * leaves this list when it ships to everyone; the type check then points to
 * the places that read it.
 */
export const TRIAL_FEATURES = [
  /** The menu that tries another interface theme. */
  'ui-themes',
  /** The click that selects the source of an element of the preview, and the edit of a text on the slide. */
  'edit-on-slide',
  /** The command of the deck controls that exports the deck as a PowerPoint file. */
  'pptx-export',
] as const

export type TrialFeature = typeof TRIAL_FEATURES[number]
