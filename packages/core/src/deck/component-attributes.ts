// Written by `node scripts/component-reference.ts` from the props of the components.
import type { ComponentAttribute } from './components.ts'

export const BUILT_IN_ATTRIBUTES: Readonly<Record<string, readonly ComponentAttribute[]>> = {
  Quote: [
    { name: 'author', description: { fr: 'Nom de la personne citée.', en: 'Name of the person quoted.' } },
    { name: 'role', description: { fr: 'Fonction de la personne citée, sous son nom.', en: 'Role of the person quoted, under the name.' } },
    { name: 'avatar', description: { fr: 'Adresse d\'un portrait affiché à côté du nom.', en: 'Address of a portrait beside the name.' } },
  ],
  Highlight: [
    { name: 'size', values: ['sm', 'md', 'lg', 'xl'], description: { fr: 'Taille du texte du message, un cran de l\'échelle typographique au-dessus du texte courant ; sans elle, le message garde la taille du texte courant.', en: 'Text size of the message, a step of the type scale above the body text; without it, the message keeps the size of the body text.' } },
  ],
  Fragments: [
    { name: 'effect', default: 'fade-in', description: { fr: 'Effets d\'apparition de Reveal, séparés par des espaces : `fade-in`, `fade-up`, `fade-left`, `grow`, `highlight-current-blue`, `fade-up grow`…', en: 'Reveal fragment effects, separated by spaces: `fade-in`, `fade-up`, `fade-left`, `grow`, `highlight-current-blue`, `fade-up grow`…' } },
    { name: 'dim', boolean: true, default: 'false', description: { fr: 'Atténue les éléments déjà montrés quand un élément suivant apparaît.', en: 'Dims the items already shown once a later one is current.' } },
    { name: 'collapse', boolean: true, default: 'false', description: { fr: 'Avec un effet qui montre un élément à son étape, les éléments encore cachés ne prennent pas de place : la diapositive se recompose à chaque étape, et l\'élément apparaît en fondu.', en: 'With an effect that shows an item at its step, the items still hidden take no space: the slide lays out its content again at each step, and an item appears with a fade.' } },
  ],
  IconInline: [
    { name: 'name', required: true, description: { fr: 'Nom Iconify de l\'icône, `ri:home-line` ; la classe Remix `ri-home-line` fonctionne aussi.', en: 'Iconify name of the icon, `ri:home-line`; the Remix class `ri-home-line` works too.' } },
    { name: 'size', default: '1.2em', description: { fr: 'Taille CSS de l\'icône.', en: 'CSS size of the icon.' } },
  ],
  Columns: [
    { name: 'size', values: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'md', description: { fr: 'Taille du texte des colonnes.', en: 'Text scale of the columns.' } },
  ],
  Column: [
    { name: 'span', description: { fr: 'Poids de la colonne dans la rangée : `span="2"` à côté de `span="1"` donne deux tiers et un tiers.', en: 'Weight of the column in the row: `span="2"` beside `span="1"` gives two thirds and one third.' } },
    { name: 'ratio', description: { fr: 'Largeur de la colonne en fraction de la rangée : `2/3`, `1/4`.', en: 'Width of the column as a fraction of the row: `2/3`, `1/4`.' } },
  ],
  Image: [
    { name: 'src', required: true, description: { fr: 'Adresse de l\'image.', en: 'Address of the image.' } },
    { name: 'alt', default: '', description: { fr: 'Texte de remplacement de l\'image.', en: 'Text alternative of the image.' } },
    { name: 'width', default: 'auto', description: { fr: 'Largeur CSS de l\'image.', en: 'CSS width of the image.' } },
    { name: 'height', default: 'auto', description: { fr: 'Hauteur CSS de l\'image.', en: 'CSS height of the image.' } },
    { name: 'fit', values: ['contain', 'cover', 'fill', 'none', 'scale-down'], default: 'contain', description: { fr: '`object-fit` CSS de l\'image dans son cadre.', en: 'CSS `object-fit` of the image in its box.' } },
    { name: 'position', default: 'center', description: { fr: '`object-position` CSS de l\'image dans son cadre.', en: 'CSS `object-position` of the image in its box.' } },
    { name: 'rounded', boolean: true, default: 'false', description: { fr: 'Arrondit les coins.', en: 'Rounds the corners.' } },
    { name: 'shadow', boolean: true, default: 'true', description: { fr: 'Dessine une ombre sous l\'image.', en: 'Draws a shadow under the image.' } },
    { name: 'preview', acceptsTrue: true, description: { fr: 'Ouvre l\'image en plein écran au clic : `true` montre `src`, une adresse montre une autre image.', en: 'Opens the image full-screen on click: `true` shows `src`, an address shows another image.' } },
  ],
  Iframe: [
    { name: 'src', required: true, description: { fr: 'Adresse de la page.', en: 'Address of the page.' } },
    { name: 'title', default: '', description: { fr: 'Titre du cadre, lu par les lecteurs d\'écran.', en: 'Accessible title of the frame.' } },
    { name: 'width', default: '100%', description: { fr: 'Largeur CSS du cadre.', en: 'CSS width of the frame.' } },
    { name: 'height', default: '500px', description: { fr: 'Hauteur CSS du cadre.', en: 'CSS height of the frame.' } },
    { name: 'allow', default: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', description: { fr: 'Permissions accordées à la page du cadre, son attribut `allow`.', en: 'Permissions policy of the frame, its `allow` attribute.' } },
    { name: 'frameborder', default: '0', description: { fr: 'L\'attribut `frameborder` du cadre.', en: 'The `frameborder` attribute of the frame.' } },
    { name: 'fullwidth', boolean: true, default: 'true', description: { fr: 'Étend le cadre à la largeur de sa colonne.', en: 'Stretches the frame to the width of its column.' } },
    { name: 'lightbox', boolean: true, default: 'false', description: { fr: 'Ouvre la page en plein écran au clic.', en: 'Opens the page full-screen on click.' } },
  ],
  Mermaid: [
    { name: 'theme', values: ['default', 'dark', 'forest', 'neutral'], description: { fr: 'Thème Mermaid ; sans lui, le diagramme prend les couleurs et la police du thème de la présentation.', en: 'A Mermaid theme; without it, the diagram takes the colors and the font of the deck theme.' } },
    { name: 'steps', description: { fr: 'Étapes d\'apparition, en groupes d\'identifiants de nœuds : `A,B|C|D` montre A et B, puis C, puis D ; un lien apparaît avec le dernier de ses deux nœuds.', en: 'Reveal steps as node-id groups: `A,B|C|D` shows A and B, then C, then D; edges follow their later node.' } },
  ],
}
