// The references kept beside the code and published in the Référence section,
// in the order of the navigation. `file` is relative to the repository root,
// and `previous` is the address the page had in the Écrire and Thèmes sections.
// The folder of the reference pages under site/content, whose number places
// the section in the navigation.
export const referenceFolder = 'docs/5.reference'

export const references = [
  { file: 'packages/nuxt/README.md', path: '/docs/reference/nuxt', title: 'Module de rendu', previous: '/ecrire/reference/nuxt' },
  { file: 'packages/schemas/README.md', path: '/docs/reference/schemas', title: 'Composants de schéma', previous: '/ecrire/reference/schemas' },
  { file: 'packages/storybook/README.md', path: '/docs/reference/storybook', title: 'Composants Storybook', previous: '/ecrire/reference/storybook' },
  { file: 'docs/theme-system.md', path: '/docs/reference/theme-system', title: 'Système de thèmes', previous: '/themes/reference/theme-system' },
  { file: 'packages/theme-kit/README.md', path: '/docs/reference/theme-kit', title: 'Kit de thèmes', previous: '/themes/reference/theme-kit' },
  { file: 'packages/theme-dsfr/README.md', path: '/docs/reference/theme-dsfr', title: 'Thème DSFR', previous: '/themes/reference/theme-dsfr' },
]
