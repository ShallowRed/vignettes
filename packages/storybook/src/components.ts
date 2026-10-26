/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { DeckComponent } from '@vignettes/core/deck'

/** The live story embeds, as the deck dialect names them. */
export const STORYBOOK_COMPONENTS: readonly DeckComponent[] = [
  {
    name: 'StoryFrame',
    snippet: {
      fr: '::StoryFrame{story="${id-de-la-story}" ratio="${16/9}" viewport="${760}" label="${Libellé}" lightbox}\n::',
      en: '::StoryFrame{story="${story-id}" ratio="${16/9}" viewport="${760}" label="${Label}" lightbox}\n::',
    },
    description: {
      fr: 'Écran Storybook vivant. story prend l\'identifiant de la story, composant--story, visible dans l\'adresse du Storybook après ?path=/story/ (attributs ratio, viewport, lightbox)',
      en: 'Live Storybook screen. story takes the id of the story, component--story, shown in the Storybook address after ?path=/story/ (attributes ratio, viewport, lightbox)',
    },
  },
  {
    name: 'Screens',
    snippet: {
      fr: ':::Screens{cols="${2}"}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n::StoryFrame{story="${id-de-la-story}" label="${Libellé}" lightbox}\n:::',
      en: ':::Screens{cols="${2}"}\n::StoryFrame{story="${story-id}" label="${Label}" lightbox}\n::StoryFrame{story="${story-id}" label="${Label}" lightbox}\n:::',
    },
    description: {
      fr: 'Galerie d\'écrans Storybook (attributs cols, gap, align)',
      en: 'Gallery of Storybook screens (attributes cols, gap, align)',
    },
  },
]
