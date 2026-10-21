---
name: writing-themes
description: >-
  Write or change a theme for Vignettes, the presentation engine built on Nuxt,
  MDC and reveal.js. Use when creating a team or brand theme: its `theme.json`
  manifest, its SCSS entry on `@vignettes/theme-kit` or `@vignettes/theme-dsfr`,
  the semantic tokens (`--accent`, `--surface`, `--text-default`…), the section
  slide surfaces, the catalog preview, its local check in the studio, or its
  publication on an instance with `mise run theme:push`.
---

# Writing a Vignettes theme

A theme is a directory holding a `theme.json` manifest, an SCSS entry named after the theme and an optional `assets/` directory. The references beside this file are copied from the repository:

- `references/theme-system.md`: the layers, the manifest, the token contract, the compilation, the publication of a tenant theme, the slide classes by heading level, and the section "Checking a theme".
- `references/theme-kit.md`: `@vignettes/theme-kit`, its base skin and its `layout` preset.
- `references/theme-dsfr.md`: `@vignettes/theme-dsfr`, its Sass variables and its entries.
- `references/control-deck.md`: the deck that shows each slide role and each element a theme colors.

## Where a theme is written

Writing and checking a theme needs a clone of the Vignettes repository (`ShallowRed/vignettes`, private), set up with `mise install` and `mise run setup`. A team theme goes in `presentations/themes/<name>/`, the content space of the instance, and takes a name other than `dsfr` and `minimal`. Start from a copy of `examples/themes/exemple-marque`, which sets the twelve tokens, paints the section slides and fills `preview`; rename its directory, its SCSS file and the `name` of its manifest.

The SCSS entry can `@use` the entries of `@vignettes/theme-kit` and `@vignettes/theme-dsfr` and the files of the theme directory: the operator of the instance compiles it in a clone of the repository. Fonts and images go in `assets/`, served at `/themes/<name>/assets/`.

## Checking and publishing

`mise run dev:nuxt` serves the studio on http://localhost:3000 and recompiles a theme when one of its `.scss` files changes; `/auth/dev-login?role=owner` signs in during development. Import the control deck with the theme's name in its `theme:`, then follow "Checking a theme" in `references/theme-system.md`.

The operator of the instance publishes the theme with `mise run theme:push`, as "Tenant themes at runtime" in `references/theme-system.md` describes. Hand the operator the theme directory and its name.
