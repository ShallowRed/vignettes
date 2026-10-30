/* eslint-disable no-template-curly-in-string -- `${…}` is the snippet placeholder syntax */
import type { DeckComponent } from '@vignettes/core/deck'
import { withAttributes } from '@vignettes/core/deck'
import { STORYBOOK_ATTRIBUTES } from './component-attributes.ts'

/** The live story embeds, as the deck dialect names them. */
export const STORYBOOK_COMPONENTS: readonly DeckComponent[] = withAttributes([
  {
    name: 'StoryFrame',
    icon: 'i-lucide-app-window',
    label: { fr: 'Écran Storybook', en: 'Storybook screen' },
    group: 'storybook',
    example: { attributes: { story: { fr: '${id-de-la-story}', en: '${story-id}' }, ratio: '${16/9}', viewport: '760', label: { fr: '${Libellé}', en: '${Label}' }, lightbox: true } },
    description: {
      fr: 'Écran d\'une story Storybook, à partir de son identifiant',
      en: 'Screen of a Storybook story, from its id',
    },
    docs: '/reference/storybook#storyframe',
  },
  {
    name: 'Screens',
    icon: 'i-lucide-layout-grid',
    label: { fr: 'Galerie d\'écrans', en: 'Screen gallery' },
    group: 'storybook',
    example: {
      attributes: { cols: '2' },
      content: [
        { name: 'StoryFrame', attributes: { story: { fr: '${id-de-la-story}', en: '${story-id}' }, label: { fr: '${Libellé}', en: '${Label}' }, lightbox: true } },
        { name: 'StoryFrame', attributes: { story: { fr: '${id-de-la-story}', en: '${story-id}' }, label: { fr: '${Libellé}', en: '${Label}' }, lightbox: true } },
      ],
    },
    description: {
      fr: 'Plusieurs écrans Storybook côte à côte',
      en: 'Several Storybook screens side by side',
    },
    docs: '/reference/storybook#screens',
  },
], STORYBOOK_ATTRIBUTES)
