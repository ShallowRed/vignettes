// Single source of truth for compiled themes (used by scripts/build-themes.js and plugins/theme-watcher.js).
// Paths are project-root-relative POSIX. When a theme @use's files outside its folder, add them to watchExtraDirs.
export const themes = [
  {
    name: 'dsfr',
    input: 'themes/dsfr/dsfr.scss',
    output: 'public/themes/dsfr.css',
    watchDir: 'themes/dsfr',
    watchExtraDirs: ['themes/shared', 'themes/presets'],
  },
  {
    name: 'dsfr-standalone',
    input: 'themes/dsfr/dsfr-standalone.scss',
    output: 'public/themes/dsfr-standalone.css',
    watchDir: 'themes/dsfr',
    watchExtraDirs: [],
  },
  {
    name: 'minimal',
    input: 'themes/minimal/minimal.scss',
    output: 'public/themes/minimal.css',
    watchDir: 'themes/minimal',
    watchExtraDirs: ['themes/shared'],
  },
  {
    name: 'dsfr-alt',
    input: 'themes/dsfr-alt/dsfr-alt.scss',
    output: 'public/themes/dsfr-alt.css',
    watchDir: 'themes/dsfr-alt',
    watchExtraDirs: ['themes/shared', 'themes/presets'],
  },
  {
    name: 'brand',
    input: 'themes/brand/brand.scss',
    output: 'public/themes/brand.css',
    watchDir: 'themes/brand',
    watchExtraDirs: ['themes/shared', 'themes/presets'],
  },
]
