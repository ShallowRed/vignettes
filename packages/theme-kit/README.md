# @vignettes/theme-kit

The engine CSS layer that every [Vignettes](https://github.com/ShallowRed/vignettes) theme builds on. It is pure SCSS with no JavaScript and no dependencies.

A Vignettes theme sets colors, typography and sizes. This package provides what every theme shares: the semantic token contract, the Reveal.js patches, the slide skeleton, the media-layout grid, the spacing scale and the quicklink styles.

## Install

```bash
pnpm add -D @vignettes/theme-kit sass
```

## Use

```scss
// mytheme.scss
@use 'pkg:@vignettes/theme-kit';

:root {
  --accent: #e63946;
  --accent-soft: #fbdcdf;
  --accent-bg: #fef4f5;
  --surface: #ffffff;
  --surface-contrast: #1d1d1d;
  --on-contrast: #ffffff;
  --text-default: #1d1d1d;
  --text-title: #000000;
  --text-mention: #666666;
}

.reveal h1 { font-size: 3em; }
```

Compile it with Sass and its package importer, which is what resolves `pkg:`:

```js
import * as sass from 'sass'

const { css } = sass.compile('mytheme.scss', {
  importers: [new sass.NodePackageImporter()],
})
```

`pkg:` is [Sass's own package syntax](https://sass-lang.com/documentation/at-rules/use/#pkg) and needs Sass 1.71 or later. Inside a Vignettes application, `pnpm build:themes` does this for every theme it finds.

## The token contract

Code that works under any theme reads these custom properties only. A theme sets them, and this package ships defaults so a theme that omits one still renders.

| Token | Purpose |
|-------|---------|
| `--accent` | Primary color: links, dividers, accents |
| `--accent-soft` | Lighter accent, for hover tints |
| `--accent-bg` | Very light tint, for callout backgrounds |
| `--surface` | Page background |
| `--surface-contrast` | Inverse surface: dark blocks, code panels |
| `--on-contrast` | Text color on `--surface-contrast` |
| `--text-default` | Body text |
| `--text-title` | Headings and strong text |
| `--text-mention` | Muted text: captions, small print |

## What it contains

`_semantic-tokens.scss` declares the contract above. `_reveal-patches.scss` adapts Reveal.js defaults and bridges MDC's wrapper elements with `display: contents`. `_slide-structure.scss` is the flex skeleton of the three slide kinds the engine tags on each section: `slide-h1` for a title slide, `slide-h2` for a section divider, `slide-h3` for a heading with body. `_media-layouts.scss` is the grid behind the media layouts. `_spacing.scss` and `_quicklinks.scss` cover the spacing scale and the in-deck navigation links.

## The base skin

```scss
@use 'pkg:@vignettes/theme-kit/base';
```

Applies the nine tokens to the page background, the text, the headings, the links, inline code, quotes, list markers and the navigation controls, with a system font. With the layout preset, a theme can consist of the nine tokens alone: [examples/themes](https://github.com/ShallowRed/vignettes/tree/main/examples/themes) holds a dark theme and a brand theme written that way. A theme that draws these elements itself leaves the base skin out.

## The layout preset

```scss
@use 'pkg:@vignettes/theme-kit/presets/layout';
```

The type scale and the spacing of the French state design system, without its colors. Use it to keep those proportions under your own palette; [@vignettes/theme-dsfr](https://www.npmjs.com/package/@vignettes/theme-dsfr) is the full theme.

## Reference

[docs/theme-system.md](https://github.com/ShallowRed/vignettes/blob/main/docs/theme-system.md) covers the theme manifest, the compilation, how a theme is discovered at runtime, and how slides nested under a section are tagged.

## License

MIT
