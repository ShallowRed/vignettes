# Theme system

A theme is a directory with a `theme.json` manifest, an SCSS entry and an optional `assets/` folder. The build compiles each theme to `public/themes/<name>.css`, copies its assets to `public/themes/<name>/`, and generates the runtime registry from the manifests. `public/themes/` is a build output; `pnpm dev` and `pnpm build` produce it.

## Layers

1. **Engine**, package `@vignettes/theme-kit` (`packages/theme-kit/`): the CSS every theme needs to work with the Vue components: the semantic token contract, Reveal patches, the MDC `display: contents` bridge, the media-layout grid, the `slide-h1/h2/h3` flex skeleton, quicklinks, and the `layout` scale preset. Themes build on this layer and never replace it.
2. **DSFR base**, package `@vignettes/theme-dsfr` (`packages/theme-dsfr/`): the French state design system as a brand-neutral theme: palette, Marianne typography, `layout` scale, light surfaces. Usable as is (`theme: dsfr`) and made to be extended. The Marianne font files come from the `@gouvfr/dsfr` npm package at build time.
3. **Themes and brands**: `themes/<name>/` in the application (`dsfr`, `dsfr-standalone`, `minimal`) and `themes/<name>/` in the content space (`NUXT_CONTENT_DIR`, `presentations/` by default) for a tenant's brands. A brand extends the DSFR base or the engine alone.

## Manifest

```json
{
  "name": "brand",
  "extends": "dsfr",
  "aliases": [],
  "lang": "fr",
  "parser": "separator",
  "reveal": { "slideNumber": true, "width": 1200, "height": 800 },
  "backgrounds": {
    "h1": "assets/slide-contrast.png",
    "h2": "assets/slide-contrast.png",
    "h3": "assets/slide-subtle.png"
  }
}
```

| Field | Role |
|-------|------|
| `name` | Equals the directory name; used in `theme:` frontmatter and as `/themes/<name>.css` |
| `extends` | Theme this one builds on; checked at build time |
| `aliases` | Other frontmatter names that resolve to this theme. A tenant uses it to point a name already present in its decks to its brand. An alias that shadows another theme's name is reported at build time |
| `lang`, `parser`, `reveal` | Deck defaults the theme carries (language for orthotypography, slide parser, Reveal config) |
| `backgrounds` | Background image per heading level (`h1`, `h2`, `h3`, `default`), relative to the theme directory or absolute URLs |
| `entry` | SCSS entry, `<name>.scss` by default |
| `assets` | Extra directories copied under `public/themes/<name>/`: `{ "from": "node_modules/...", "to": "fonts", "match": "regex" }`, resolved from the project root |
| `code` | Code theme of the deck blocks by default: a name of `CODE_THEMES` (`nuit`, `sombre`, `clair`), or its properties |
| `preview` | How the catalog draws the card of a deck on this theme, without loading the theme's stylesheet |

`preview` takes `fontFamily`, `titleColor`, `titleGradient` (a gradient applied to the text of the title), `textColor` and `surface`. Its `fonts` field names an SCSS entry declaring the font faces, compiled on its own to `public/themes/<name>/preview-fonts.css`, which the catalog loads; `pkg:@vignettes/theme-dsfr/fonts` is the value the DSFR theme uses. `levels` overrides `titleColor`, `titleGradient` and `textColor` for a first slide of another heading level, and `titleGradient: 'none'` removes the gradient there.

```json
{
  "preview": {
    "fontFamily": "Marianne, Arial, sans-serif",
    "fonts": "pkg:@vignettes/theme-dsfr/fonts",
    "titleColor": "#000091",
    "textColor": "#3a3a3a",
    "surface": "#ffffff"
  }
}
```

`packages/core/src/theme/tokens.generated.ts` is generated from the manifests of the application's themes by `scripts/build-theme-tokens.ts` and committed; it seeds the runtime registry in `packages/core/src/theme/tokens.ts` (`knownThemes`, `resolveThemeName`, `isKnownTheme`, `getThemeTokens`). Frontmatter accepts canonical names and aliases; `resolveThemeName` maps a name to the theme whose CSS is loaded.

## Tenant themes at runtime

Themes of the content space are not part of the image. `mise run theme:push -- <name>[,<name>] --apply` compiles them locally and uploads `themes/<name>.css`, `themes/<name>/assets/`, and `themes/<name>/tokens.json` to the bucket, then rebuilds `themes/index.json` from every published theme. On a deployment, `server/utils/themes.ts` reads that index (cached for a minute; `POST /api/admin/themes/reload` forces it), merges it with the themes found on disk in the content space (development), and applies the result with `setThemeRegistry`. The `theme-registry` server middleware hands the registry to page requests and the universal plugin `src/plugins/theme-registry.ts` seeds the client with it, so both sides resolve names, aliases and backgrounds identically. `/themes/**` (`server/routes/themes/[...path].ts`) streams the files from the bucket for names that have no static file under `public/themes/`.

## The semantic token contract

Code that must not care which theme is active (the engine layer, MDC components such as `Highlight.vue`) references these custom properties only. Each theme sets them.

| Token | Purpose |
|-------|---------|
| `--accent` | Primary color (links, dividers, accents) |
| `--accent-soft` | Lighter accent (hover tints) |
| `--accent-bg` | Very light tint (callout backgrounds) |
| `--surface` | Page background |
| `--surface-contrast` | Inverse surface (dark blocks, code panels) |
| `--on-contrast` | Text color on `--surface-contrast` |
| `--text-default` | Body text |
| `--text-title` | Headings, strong text |
| `--text-mention` | Muted text (small, captions) |

`packages/theme-kit/_semantic-tokens.scss` provides defaults so a theme still renders if it forgets one.

## The code theme of a deck

A deck sets the colors of its code blocks in its frontmatter (`code: sombre`, or `code: { theme: sombre, string: '#FFD700' }`). `RevealPresentation` turns that value into `--code-*` custom properties on the deck root and adds the class `reveal--code-theme`. `packages/nuxt/src/runtime/assets/code-theme.css`, which ships with the renderer, colors each token from these properties under any theme. A role the code theme omits keeps the color of the highlight theme (`mdc.highlight.theme`).

A deck without a code theme takes the one its theme names in its manifest (`"code": "clair"`). `clair` is the light palette: one DSFR illustrative tone per kind of value, each with a contrast of 5:1 or more against the block. When the theme names none, the deck carries neither the class nor the properties and its tokens keep the colors of the highlight theme.

`reveal--code-block` is added only when the frontmatter of the deck names a `background`: the renderer then paints the block. The code theme of a theme never adds it, because the theme draws its own block.

A theme reads `--code-size` as a minimum for its own size: `font-size: max(var(--code-size, 0px), 0.7em)`.

## Compilation

```bash
pnpm build:themes                       # tokens, then every theme
pnpm build:theme brand                  # one theme
node scripts/build-themes.ts --watch    # recompile on change
```

`packages/nuxt/src/build/theme-registry.ts` discovers the themes; `packages/nuxt/src/build/theme-build.ts` compiles one theme with sass and its `NodePackageImporter`, so `@use 'pkg:@vignettes/theme-kit'` resolves from the application's `node_modules` wherever the theme directory is. `packages/nuxt/src/build/theme-watcher.js` watches theme directories and `packages/` during `nuxt dev` and reloads the page after a recompile. `server/plugins/theme-consistency.ts` warns at boot when a theme directory, its compiled CSS and the generated tokens disagree.

## Writing a theme

A brand on the DSFR base:

```scss
// presentations/themes/mybrand/mybrand.scss
@use 'pkg:@vignettes/theme-dsfr/variables' as *;
@use 'pkg:@vignettes/theme-dsfr';

.reveal h1 { color: #0000cc; }
.reveal section.slide-h2 h2 { color: var(--dsfr-grey-950) !important; }
```

A theme made of the nine tokens alone, with the base skin of the kit and the DSFR sizes (`examples/themes/exemple-sombre` and `exemple-marque` are complete examples):

```scss
@use 'pkg:@vignettes/theme-kit';
@use 'pkg:@vignettes/theme-kit/base';
@use 'pkg:@vignettes/theme-kit/presets/layout';

:root {
  --accent: #c2410c;
  --surface: #fffdf9;
  // the seven other tokens of the contract
}
```

A theme on the engine alone, with its own scale:

```scss
// themes/mytheme/mytheme.scss
@use 'pkg:@vignettes/theme-kit';

:root {
  --accent: #e63946;
  --surface: #ffffff;
  // the rest of the contract
}

.reveal h1 { font-size: 3em; }
```

Add `theme.json`, run `pnpm build:themes`, and use `theme: mytheme` in a deck. `pkg:@vignettes/theme-kit/presets/layout` gives a theme the DSFR sizes without its colors.

## The fallback theme

A deck whose frontmatter declares no `theme:` renders in the fallback theme of the instance. The create form preselects that theme and a catalog card previews such a deck with it. `runtimeConfig.public.defaultTheme` names it (`dsfr` in this application) and `NUXT_PUBLIC_DEFAULT_THEME` overrides it at run time. Without a host setting, `@vignettes/nuxt` falls back to `minimal`. A name that matches no registered theme is reported at boot under `[themes]` and ignored.

## Slides by heading level

The engine tags each `<section>`: `slide-h1` (title slide), `slide-h2` (section divider), `slide-h3` (heading plus body). The flex skeleton comes from `packages/theme-kit/_slide-structure.scss`; themes set sizes and colors, and backgrounds come from the manifest.

A section that holds vertical slides is wrapped in Reveal's stack. That wrapper carries `stack-h1` / `stack-h2` instead of a `slide-` class, and the section's own content is the first of its vertical slides, keeping its own `slide-` class. So a rule written as `.reveal section.slide-h2 h3` styles the divider alone and cannot reach the slides nested under it. Target `stack-h2` to style the wrapper itself.

## Standalone DSFR

`dsfr-standalone` (`packages/theme-dsfr/standalone.scss`) targets vanilla Reveal.js pages and frozen bundles, where the Vue components are absent; it does not import the engine layer.

## Troubleshooting

- Stylesheet 404: `public/themes/<name>.css` is missing; run `pnpm build:themes`.
- A deck reports an unknown theme: the name is neither a directory with a manifest nor an alias; check `packages/core/src/theme/tokens.generated.ts`.
- Changes in a package do not show: the watcher recompiles every theme on a `packages/` change; a hard refresh may be needed.
- `assets "node_modules/..." not found`: install dependencies, the DSFR fonts come from `@gouvfr/dsfr`.
