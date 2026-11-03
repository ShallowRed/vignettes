// Written by `node scripts/component-reference.ts` from the props of the components.
import type { ComponentAttribute } from '@vignettes/core/deck'

export const STORYBOOK_ATTRIBUTES: Readonly<Record<string, readonly ComponentAttribute[]>> = {
  Screens: [
    { name: 'cols', description: { fr: 'Nombre de colonnes ; par défaut, une rangée de cadres de même largeur.', en: 'Column count; defaults to an even auto-fit row.' } },
    { name: 'gap', description: { fr: 'Espace CSS entre les cadres.', en: 'CSS gap between the frames.' } },
    { name: 'align', values: ['start', 'center', 'stretch'], default: 'stretch', description: { fr: 'Alignement vertical des cadres dans leur rangée.', en: 'Vertical alignment of the frames in their row.' } },
  ],
  StoryFrame: [
    { name: 'story', description: { fr: 'Identifiant de la story Storybook (`<componentId>--<storyName>`).', en: 'Storybook story id (`<componentId>--<storyName>`).' } },
    { name: 'src', description: { fr: 'Adresse à afficher quand `story` est absent.', en: 'Explicit URL, used when `story` is absent.' } },
    { name: 'type', values: ['iframe', 'image'], description: { fr: 'Nature du média ; sans lui, une story ou une adresse est une page, et une adresse qui finit par une extension d\'image est une image.', en: 'Kind of media; without it, a story or an address is a page, and an address that ends with an image extension an image.' } },
    { name: 'fit', values: ['cover', 'contain'], default: 'cover', description: { fr: '`object-fit` CSS d\'une image dans le cadre.', en: 'CSS `object-fit` of an image in the frame.' } },
    { name: 'ratio', description: { fr: 'Proportions : un nom (`desktop` 16/10, `wide` 16/9, `classic` 4/3, `photo` 3/2, `square`, `mobile` 9/16, `portrait` 3/4) ou un rapport comme `16/9`. Sans lui, le cadre est en `wide` hors d\'une galerie, et remplit sa place sur une diapositive `:layout{screen}`.', en: 'Aspect ratio: a name (`desktop` 16/10, `wide` 16/9, `classic` 4/3, `photo` 3/2, `square`, `mobile` 9/16, `portrait` 3/4) or a ratio such as `16/9`. Without it, the frame is `wide` outside a gallery, and fills its room on a `:layout{screen}` slide.' } },
    { name: 'viewport', description: { fr: 'Largeur en px à laquelle la page est affichée avant d\'être réduite ; plus elle est grande, plus on voit de la page.', en: 'Logical width (px) the iframe renders at before scaling; a higher value shows more of the page.' } },
    { name: 'previewWidth', description: { fr: 'Autre nom de `viewport`, lu dans les présentations existantes.', en: 'Another name of `viewport`, read in the existing presentations.' } },
    { name: 'raw', boolean: true, default: 'false', description: { fr: 'Affiche le cadre à sa taille réelle, sans le réduire.', en: 'Renders the frame at its native size, without scaling.' } },
    { name: 'label', description: { fr: 'Légende sous le cadre ; remplace le contenu du bloc.', en: 'Caption under the frame; overrides the default slot.' } },
    { name: 'lightbox', boolean: true, default: 'false', description: { fr: 'Ouvre l\'écran en plein écran au clic.', en: 'Opens the screen full-screen on click.' } },
    { name: 'title', description: { fr: 'Titre du cadre lu par les lecteurs d\'écran, ou texte de remplacement d\'une image.', en: 'Accessible title of the frame, or the text alternative of an image.' } },
    { name: 'grow', boolean: true, default: 'false', description: { fr: 'Laisse le cadre prendre toute la hauteur disponible, dans une galerie.', en: 'Lets the frame grow to fill the available height, in a gallery.' } },
    { name: 'hint', description: { fr: 'Texte affiché à côté du cadre pour inviter à l\'utiliser.', en: 'Incentive text shown beside the frame to invite interaction.' } },
  ],
}
