# @vignettes/theme-dsfr

The base [Vignettes](https://github.com/ShallowRed/vignettes) theme following the [Système de Design de l'État](https://www.systeme-de-design.gouv.fr) (DSFR), the French state design system: its palette, Marianne typography and type scale, on light surfaces. It is pure SCSS with no JavaScript.

The theme is brand-neutral and meant to be extended. Use it as it is for a deck that should look like a French public service, or build a brand on top of it and keep its proportions.

This package is not an official French state product and carries no state branding beyond the design system's public tokens.

## Install

```bash
pnpm add -D @vignettes/theme-dsfr @vignettes/theme-kit sass
```

[@vignettes/theme-kit](https://www.npmjs.com/package/@vignettes/theme-kit) is a peer dependency: this theme is built on that engine layer.

## Use

```scss
@use 'pkg:@vignettes/theme-dsfr';
```

That entry imports the engine layer and the `dsfr-layout` preset. Compile it with Sass's package importer, as [@vignettes/theme-kit](https://www.npmjs.com/package/@vignettes/theme-kit) describes.

## Extending it

```scss
@use 'pkg:@vignettes/theme-dsfr/variables' as *;
@use 'pkg:@vignettes/theme-dsfr';

.reveal h1 { color: #0000cc; }
.reveal section.slide-h2 h2 { color: var(--dsfr-grey-950) !important; }
```

`variables` exposes the DSFR Sass variables, all declared `!default`, so your own values take precedence when you set them before the `@use` of the theme. The theme also publishes every token as a custom property (`--dsfr-blue-france-main-525`, `--dsfr-text-default` and so on) and maps them onto the engine's semantic contract (`--accent`, `--surface`, `--text-default`), which is what theme-agnostic components read.

## Entries

| Entry | What it is |
|-------|------------|
| `pkg:@vignettes/theme-dsfr` | The theme: variables, fonts, engine layer, layout preset, base, typography, components, utilities |
| `pkg:@vignettes/theme-dsfr/variables` | The Sass variables alone, to read or override them |
| `pkg:@vignettes/theme-dsfr/fonts` | The Marianne `@font-face` rules alone |
| `pkg:@vignettes/theme-dsfr/standalone` | For vanilla Reveal.js pages and frozen bundles, where the Vignettes components are absent; it does not import the engine layer |

## The Marianne font files

The `@font-face` rules point at `/themes/dsfr/fonts/Marianne-*.woff2`. The files themselves are not in this package: they come from [@gouvfr/dsfr](https://www.npmjs.com/package/@gouvfr/dsfr), and a Vignettes theme copies them through its manifest.

```json
{
  "assets": [
    { "from": "node_modules/@gouvfr/dsfr/dist/fonts", "to": "fonts", "match": "^Marianne-[A-Za-z]+\\.woff2?$" }
  ]
}
```

Outside Vignettes, serve those files at that path yourself, or override the `src` of each face. Without them the browser falls back to the next family in the stack.

## License

MIT. The DSFR itself is published by the French state under its own [license](https://github.com/GouvernementFR/dsfr/blob/main/LICENSE.md).
