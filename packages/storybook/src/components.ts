/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { DeckComponent } from '@vignettes/core/deck'

/** The live story embeds, as the deck dialect names them. */
export const STORYBOOK_COMPONENTS: readonly DeckComponent[] = [
  {
    name: 'StoryFrame',
    label: { fr: 'Écran Storybook', en: 'Storybook screen' },
    group: 'storybook',
    snippet: {
      fr: '::StoryFrame{story="${id-de-la-story}" ratio="${16/9}" viewport="760" label="${Libellé}" lightbox}\n::',
      en: '::StoryFrame{story="${story-id}" ratio="${16/9}" viewport="760" label="${Label}" lightbox}\n::',
    },
    description: {
      fr: 'Écran d\'une story Storybook, à partir de son identifiant',
      en: 'Screen of a Storybook story, from its id',
    },
    docs: '/reference/storybook#storyframe',
  },
  {
    name: 'Screens',
    label: { fr: 'Galerie d\'écrans', en: 'Screen gallery' },
    group: 'storybook',
    snippet: {
      fr: ':::Screens{cols="2"}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n::\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n::\n:::',
      en: ':::Screens{cols="2"}\n::StoryFrame{story="${story-id}" label="${Label}" lightbox}\n::\n::StoryFrame{story="${story-id}" label="${Label}" lightbox}\n::\n:::',
    },
    description: {
      fr: 'Plusieurs écrans Storybook côte à côte',
      en: 'Several Storybook screens side by side',
    },
    docs: '/reference/storybook#screens',
  },
]
