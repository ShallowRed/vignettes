# @vignettes/theme-dsfr

The base [Vignettes](https://github.com/ShallowRed/vignettes) theme following the [Système de Design de l'État](https://www.systeme-de-design.gouv.fr) (DSFR), the French state design system: its palette, Marianne typography and type scale, on light surfaces. It is a set of SCSS files.

The theme is brand-neutral and meant to be extended. Use it as it is for a deck that should look like a French public service, or build a brand on top of it and keep its proportions.

This package is not an official French state product. It draws the bloc marque of the French state when a deck or a theme sets `brand`, and the bloc marque is reserved for the services of the state.

## Install

```bash
pnpm add -D @vignettes/theme-dsfr @vignettes/theme-kit sass
```

[@vignettes/theme-kit](https://www.npmjs.com/package/@vignettes/theme-kit) is a peer dependency: this theme is built on that engine layer.

## Use

```scss
@use 'pkg:@vignettes/theme-dsfr';
```

That entry imports the engine layer and the `layout` preset. Compile it with Sass's package importer, as [@vignettes/theme-kit](https://www.npmjs.com/package/@vignettes/theme-kit) describes.

## Extending it

```scss
@use 'pkg:@vignettes/theme-dsfr/variables' as *;
@use 'pkg:@vignettes/theme-dsfr';

.reveal h1 { color: #0000cc; }
.reveal section.slide-h2 h2 { color: var(--dsfr-grey-950) !important; }
```

`variables` exposes the DSFR Sass variables, all declared `!default`, so your own values take precedence when you set them before the `@use` of the theme. The theme also publishes every token as a custom property (`--dsfr-blue-france-main-525`, `--dsfr-text-default` and so on) and maps them onto the engine's semantic contract (`--accent`, `--surface`, `--text-default`), which the components read under any theme.

`_palette.scss` gives the cards and the regions of a diagram the DSFR illustrative palette. Each generic name of the theme kit points to one DSFR tone (`green` to `green-emeraude`, `blue` to `blue-cumulus`), and the theme also defines the eighteen DSFR names, such as `color="green-menthe"` or `color="orange-terre-battue"`.

## The bloc marque

A Vignettes deck sets `brand` in its frontmatter, or its theme in its manifest, and the theme draws the bloc marque of the state at the top of the title slide or of every slide: Marianne, the official title, the motto and, beside them, the logo of an operator. The theme takes the `fr-logo` stylesheet from [@gouvfr/dsfr](https://www.npmjs.com/package/@gouvfr/dsfr), a peer dependency.

The version follows the background of the slide: in color on a light background, and in color on a white plate on a background image. On a background that Reveal marks `has-dark-background`, a dark color or a media under a veil, `onDark` chooses between the bloc marque in white, Marianne cut out of a white flag with the title and the motto in white (`white`, the default), and the bloc marque in color on the white plate (`color`).

```yaml
brand:
  ministry: [Ministère, de l'Intérieur]
  operator: /images/operateur.svg
  operatorAlt: Nom de l'opérateur
  slides: all
  onDark: color
```

## Entries

- `pkg:@vignettes/theme-dsfr` is the theme: variables, fonts, engine layer, layout preset, base, typography, components, utilities, palette.
- `pkg:@vignettes/theme-dsfr/variables` contains the Sass variables, to read or override them.
- `pkg:@vignettes/theme-dsfr/fonts` contains the Marianne `@font-face` rules.
- `pkg:@vignettes/theme-dsfr/preview` is the stylesheet of the catalog card, which a Vignettes manifest names in `preview.fonts`: the Marianne faces and the bloc marque.

## The Marianne font files

The `@font-face` rules point at `/themes/dsfr/fonts/Marianne-*.woff2`. The files come from [@gouvfr/dsfr](https://www.npmjs.com/package/@gouvfr/dsfr), and a Vignettes theme copies them through its manifest.

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
