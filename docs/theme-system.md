# Theme system

A theme is a directory with a `theme.json` manifest, an SCSS entry and an optional `assets/` folder. The build compiles each theme to `public/themes/<name>.css`, copies its assets to `public/themes/<name>/`, and generates the runtime registry from the manifests. `public/themes/` is a build output; `pnpm dev` and `pnpm build` produce it.

## Layers

- The engine, package `@vignettes/theme-kit` (`packages/theme-kit/`), holds the CSS every theme needs to work with the Vue components: the semantic token contract, Reveal patches, the MDC `display: contents` bridge, the media-layout grid, the `slide-h1/h2/h3` flex skeleton, quicklinks, and the `layout` scale preset. Every theme builds on this layer. Its Reveal patches display inline `code` as an `inline-block` box, and the renderer puts the code and the punctuation next to it in a `code-group` span that the kit keeps on one line: the segment moves to the next line whole, with its punctuation, and breaks inside its box only when it is longer than the line.
- The DSFR base, package `@vignettes/theme-dsfr` (`packages/theme-dsfr/`), is the French state design system as a brand-neutral theme: palette, Marianne typography, `layout` scale, light surfaces. A brand extends it, and so does the application's own `dsfr` theme. The build copies the Marianne font files from the `@gouvfr/dsfr` npm package. `@vignettes/theme-dsfr` leaves the surface of each slide role to the theme that extends it. `themes/dsfr/` paints flat surfaces from the DSFR palette on Reveal's background layer (see "Slides by role"): the title slide on `blue-france-975`, section dividers on `blue-france-sun-113` with light text, content slides on white.
- The application's themes (`dsfr`, `minimal`) are in `themes/<name>/`, and a tenant's brands in `themes/<name>/` of the content space (`NUXT_CONTENT_DIR`, `presentations/` by default). A brand extends the DSFR base or the engine alone.

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

- `name` equals the directory name. A deck names the theme with it in `theme:`, and the stylesheet is `/themes/<name>.css`.
- `extends` names the theme this one builds on; the build checks it. The editor completes the icons and the pictograms in the decks of a theme that builds on `dsfr`, directly or through another theme.
- `aliases` lists other frontmatter names that resolve to this theme. A tenant uses it to point a name already present in its decks to its brand. The build reports an alias that shadows another theme's name.
- `lang`, `parser` and `reveal` are the deck defaults the theme carries: the language for orthotypography, the slide parser and the Reveal config.
- `backgrounds` gives the background image of the title slide (`h1`), the sections (`h2`), the content slides (`h3`) and the others (`default`), as a path relative to the theme directory or an absolute URL.
- `brand` gives the bloc marque of the French state that the theme's decks show in the header of their slides: `ministry`, the lines of the official title (`République française` by default), `operator`, the operator's logo as a path relative to the theme directory or an absolute URL, `operatorAlt`, the operator's name, `slides`, `cover` for the title slide (the default) or `all`, and `onDark`, its version on a dark background, `white` (the default) or `color` for the colors on a white plate. A deck's frontmatter `brand` overrides these keys one by one, and `brand: false` removes it. A theme built on `@vignettes/theme-dsfr` draws it; the bloc marque is reserved for the services of the state.
- `entry` is the SCSS entry, `<name>.scss` by default.
- `assets` lists extra directories copied under `public/themes/<name>/`, as `{ "from": "node_modules/...", "to": "fonts", "match": "regex" }`, resolved from the project root.
- `code` is the default code theme of the deck blocks: a name of `CODE_THEMES` (`nuit`, `sombre`, `clair`), or its properties.
- `preview` describes how the catalog draws the card of a deck on this theme, without loading the theme's stylesheet.
- `pptx.font` names the font the PowerPoint export embeds in the file, for a font whose license allows it, such as a font under the SIL Open Font License: `family` is the name the slides give the font, and `src` the path of its regular face, a TrueType, OpenType or WOFF file relative to the theme directory. PowerPoint shows the embedded font on a computer that lacks it; Keynote ignores the embedded font and shows another one. A theme without `pptx.font` gives the slides the name of its font, which the computer that opens the file shows when it has it.

`preview` takes `fontFamily`, `titleColor`, `titleGradient` (a gradient applied to the text of the title), `textColor` and `surface`. Its `fonts` field names the SCSS entry of the card's stylesheet, its font faces and what else the card draws, compiled on its own to `public/themes/<name>/preview-fonts.css`, which the catalog loads; `pkg:@vignettes/theme-dsfr/preview` is the value the DSFR theme uses: it declares the Marianne faces and draws the deck's bloc marque on the card, as the theme does on the slides. `levels` overrides `titleColor`, `titleGradient` and `textColor` for a first slide of another role, and `titleGradient: 'none'` removes the gradient there.

```json
{
  "preview": {
    "fontFamily": "Marianne, Arial, sans-serif",
    "fonts": "pkg:@vignettes/theme-dsfr/preview",
    "titleColor": "#000091",
    "textColor": "#3a3a3a",
    "surface": "#ffffff"
  }
}
```

```json
{
  "pptx": {
    "font": { "family": "Quicksand", "src": "assets/fonts/Quicksand-Regular.ttf" }
  }
}
```

`packages/core/src/theme/tokens.generated.ts` is generated from the manifests of the application's themes by `scripts/build-theme-tokens.ts` and committed; it seeds the runtime registry in `packages/core/src/theme/tokens.ts` (`knownThemes`, `resolveThemeName`, `isKnownTheme`, `getThemeTokens`). Frontmatter accepts canonical names and aliases; `resolveThemeName` maps a name to the theme whose CSS is loaded.

## Tenant themes at runtime

Themes of the content space reach a deployment through the bucket. `mise run theme:push -- <name>[,<name>] --apply` compiles them locally and uploads `themes/<name>.css`, `themes/<name>/assets/`, and `themes/<name>/tokens.json` to the bucket, then rebuilds `themes/index.json` from every published theme. An instance that shares the bucket with another one reads its themes under a folder of its own: `NUXT_FROZEN_S3_THEMES_PREFIX=staging` gives `staging/themes/…`, and `theme:push --staging` publishes there with the secrets of the Infisical environment `staging`. On a deployment, `server/utils/themes.ts` reads that index (cached for a minute; `POST /api/admin/themes/reload` forces it), merges it with the themes found on disk in the content space (development), and applies the result with `setThemeRegistry`. The `theme-registry` server middleware hands the registry to page requests and the universal plugin `src/plugins/theme-registry.ts` seeds the client with it, so both sides resolve names, aliases and backgrounds identically. `/themes/**` (`server/routes/themes/[...path].ts`) streams the files from the bucket for names that have no static file under `public/themes/`.

### The theme packages a theme was compiled with

A published theme holds the CSS of `@vignettes/theme-kit` and `@vignettes/theme-dsfr` that the machine running `theme:push` had installed. `theme:push` writes their versions in `tokens.json` and in the index, under `compiledWith`: the `version` of each package, then the start of a hash of its stylesheets (`0.1.0+6a73b97e14`), which changes with any change to a stylesheet. The build of an instance computes the same versions (`themePackageVersions` of `packages/nuxt/src/build/theme-build.ts`). When the two differ, or when a theme has no `compiledWith`, the server writes the theme and the two versions in its log as it loads the themes, and `POST /api/admin/themes/reload` returns them under `gaps`. Publishing the theme again from a checkout of the branch the instance runs clears the gap.

### Testing a change of the theme packages

A pull request that changes `packages/theme-kit` or `packages/theme-dsfr` changes the CSS of the published themes once they are compiled again. To test it on staging, push the branch to `staging`, then publish the themes the test decks use from that branch:

```sh
mise run theme:push -- <name>[,<name>] --staging --apply
```

Staging serves the themes published under its prefix: a deck whose theme was published without `--staging` renders there without its stylesheet.

Production keeps serving the themes published without `--staging`. After the merge into `main` and the deployment of production, publish the same themes from `main` without `--staging`:

```sh
mise run theme:push -- <name>[,<name>] --apply
```

## Renaming a theme in a deployed instance

A deck's theme is written in the frontmatter of each of its published versions, of its draft and of its snapshots, and in the `theme` column the catalog reads. `mise run theme:rename -- <from> <to>` rewrites all of them in one instance, through the app container, listing the decks it would touch before `--apply` writes anything. `scripts/lib/theme-rename.ts` defines what a theme declaration looks like.

## The semantic token contract

Code that works under any theme (the engine layer, MDC components such as `Highlight.vue`) reads these custom properties only, and each theme sets them:

- `--accent` is the primary color, for links, dividers and accents.
- `--accent-soft` is a lighter accent, for hover tints.
- `--accent-bg` is a very light tint, for callout backgrounds.
- `--accent-strong` is the accent mixed with the title color, for text on `--accent-soft` or `--accent-bg`, derived from `--accent` by default.
- `--accent-line` is the accent mixed with the surface, for the outlines of a diagram: the cards, the subject regions and the edge labels, derived from `--accent` by default.
- `--surface` is the page background.
- `--surface-contrast` is the inverse surface, for dark blocks and code panels.
- `--on-contrast` is the text color on `--surface-contrast`.
- `--text-default` colors the body text, `--text-title` the headings and strong text, `--text-mention` the muted text (small print, captions).
- `--border`, `--radius` and `--shadow` give the outline, the corners and the elevation of a box drawn by a component.
- `--text-step-1` to `--text-step-4` are the type scale above the body text, in `em` of the text around: the headings inside the body and the sizes of `Highlight.vue` read them.
- `--flow-space`, `--block-space` and `--heading-space-before` are the vertical rhythm of the body of a content slide: the space inside a group of text (between a heading and its paragraph, two paragraphs, a paragraph and its list, two list items), above and below a block other than text, and above a heading of the body. `--measure` is the maximum line length of a paragraph or a list of that body.

`packages/theme-kit/_semantic-tokens.scss` gives each token a default value, which applies when a theme omits it. `packages/theme-kit/_palette.scss` defines the tints of the diagram cards, `--palette-<name>-bg`, `-main` and `-text`, under eight generic names a theme redefines.

The kit derives three more tokens from the text intensities, at the root of the page: `--on-surface-title`, `--on-surface-default` and `--on-surface-mention`. A component that paints its own surface, such as a diagram card or a story frame, sets the text of that surface from them. A slide that changes its text colors, such as a dark section divider, leaves that surface with its dark text.

## The code theme of a deck

A deck sets the colors of its code blocks in its frontmatter (`code: sombre`, or `code: { theme: sombre, string: '#FFD700' }`). `RevealPresentation` turns that value into `--code-*` custom properties on the deck root and adds the class `reveal--code-theme`. `packages/nuxt/src/runtime/assets/code-theme.css`, which ships with the renderer, colors each token from these properties under any theme. A role the code theme omits keeps the color of the highlight theme (`mdc.highlight.theme`).

A deck without a code theme takes the one its theme names in its manifest (`"code": "clair"`). The three code themes read the tokens of the theme kit. `nuit` sets the colors of github-dark on `--code-surface-dark`. `sombre` keeps its own dark palette. `clair` sets a block of `--code-surface` with the text intensities, `--accent-strong` for the keys and the `-text` tones of the card palette for the strings, the literals and the functions. `clair` suits a light theme: under the kit defaults and under `dsfr`, each of its tones reaches a contrast of 4.5:1 or more against the block, and the author of a theme that changes these tokens checks that contrast. The author of a dark theme names `nuit` or `sombre` in its manifest. The current zone of a `JsonTour` is marked with `--accent-on-contrast` on a dark block, `--accent-strong` on `clair`. When the theme names none, the deck carries neither the class nor the properties and its tokens keep the colors of the highlight theme.

`RevealPresentation` adds `reveal--code-block` when the frontmatter of the deck names a `background`, and the renderer then draws the block. With a code theme named in a manifest, the theme's stylesheet draws the block.

A theme reads `--code-size` as a minimum for its own size, and `--code-min-size`, in slide units, as the smallest size of a code block (`0px` in the kit; `15px` in `dsfr` and `minimal`, where a block in a narrow column stays readable): `font-size: max(var(--code-size, 0px), 0.7em, var(--code-min-size))`.

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

A theme made of the tokens, with the base skin of the kit and the DSFR sizes (`examples/themes/exemple-sombre` and `exemple-marque` are complete examples; `exemple-marque` also paints its section slides):

```scss
@use 'pkg:@vignettes/theme-kit';
@use 'pkg:@vignettes/theme-kit/base';
@use 'pkg:@vignettes/theme-kit/presets/layout';

:root {
  --accent: #c2410c;
  --surface: #fffdf9;
  // the ten other tokens of the contract
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

A deck whose frontmatter declares no `theme:` renders in the fallback theme of the instance. The create form preselects that theme and a catalog card previews such a deck with it. `runtimeConfig.public.defaultTheme` names it (`dsfr` in this application) and `NUXT_PUBLIC_DEFAULT_THEME` overrides it at run time. Without a host setting, `@vignettes/nuxt` falls back to `minimal`. When that name matches no registered theme, the server ignores it and writes a `[themes]` warning at boot that names the theme applied.

## Slides by role

The engine tags each `<section>` with the class of its role, which `surfaceLevel` of `packages/core/src/deck/model.ts` gives: `slide-h1` for the title slide, `slide-h2` for a section divider, `slide-h3` for a content slide. A section divider is a `##` slide made of its heading and at most one paragraph of 140 characters or fewer, besides its speaker notes and its annotations other than `:layout` (`isSectionSlide` of `packages/core/src/deck/split.ts`). A `##` slide with more content is a content slide and carries `slide-h3`; the manifest's `h2` and `h3` backgrounds follow the same roles. The flex skeleton comes from `packages/theme-kit/_slide-structure.scss`; themes set sizes and colors, and backgrounds come from the manifest.

A section that holds vertical slides is wrapped in Reveal's stack. That wrapper carries `stack-h1` or `stack-h2` and no `slide-` class, and the section's own content is the first of its vertical slides, with its own `slide-` class. So a rule written as `.reveal section.slide-h2 h3` styles the divider alone and cannot reach the slides nested under it. Target `stack-h2` to style the wrapper itself.

A flat color surface goes on Reveal's background layer: Reveal creates one `.slide-background` per slide under `.reveal .backgrounds`, copies the slide's classes onto it, and fills the screen with it whatever the aspect ratio. A rule such as `.reveal .slide-background.slide-h2 { background-color: … }` colors the divider edge to edge, and Reveal reads that computed color to mark the slide and the deck `has-dark-background`, which switches its controls to light on its own. Painting the section itself leaves the viewport color visible around the slide on screens of another ratio. The rule leaves out the parent of the layer: the print view moves the layer into the `.pdf-page` of its slide, and the scroll view, under 435 pixels wide, into the `.scroll-page-content` of its slide.

## Checking a theme

`examples/controle-du-theme.md` is a deck that holds each slide role and each element a theme colors: the title slide, a section, a short and a long content slide, inline code, a list, a table, a quote, a code block, columns, a media on the right, a media taking two thirds of the width on the left, a media at the bottom, an image behind the text on a card, an image behind the text under a veil, a Mermaid diagram, a `Diagram` with a colored region and colored nodes, and a `##` slide with content. Write the name of the theme under check in its `theme:`, import it in a local studio, and read every slide, the vertical ones included:

- Sizes: 1280 × 720 and 1920 × 1080, then 390 pixels wide. Under 435 pixels, reveal.js switches to its scroll view: the slides follow one another, each scaled to the width of the screen, so the body text measures a few pixels whatever the theme. Each section keeps its surface edge to edge.
- Contrast: 4.5:1 or more between a text and its surface, 3:1 for a text of 24 pixels or more, or of 18.5 pixels or more in bold (RGAA, criterion 3.2). The pairs are `--text-title`, `--text-default` and `--text-mention` on `--surface`; `--accent` on `--surface` for the links and on `--accent-bg` for the inline code of the base skin; `--accent-strong` on `--accent-soft` for an emphasized diagram node; each `--palette-<name>-text` on `--surface` and on its `--palette-<name>-bg`; `--on-contrast` on `--surface-contrast`; the title, the text and the links of a section on its surface.
- Inline code: an inline box with a padding and a background. At the end of a line, the browser can break a segment at a space it holds: the background stops at the end of the line and starts again on the next one without its padding. Read the three long segments of the long content slide at each width.
- Diagrams: Mermaid fills its boxes with `--accent-bg`, outlines them with `--accent` and writes their labels in `--on-surface-title`; its lines take the `--text-mention` of the slide, its free text the `--text-default` of the slide, and it measures its labels with the font of the slide. The last slide has a `##` heading and a diagram: it takes the surface of a content slide. The renderer scales a diagram down to the width of its column, and its height follows: a wide font scales a wide diagram down further, and a tall diagram can reach the navigation arrows.
- The PDF export prints the section surfaces.

## Troubleshooting

- Stylesheet 404: `public/themes/<name>.css` is missing; run `pnpm build:themes`.
- A deck reports an unknown theme: the name is neither a directory with a manifest nor an alias; check `packages/core/src/theme/tokens.generated.ts`.
- Changes in a package do not show: the watcher recompiles every theme on a `packages/` change; a hard refresh may be needed.
- `assets "node_modules/..." not found`: install dependencies, the DSFR fonts come from `@gouvfr/dsfr`.
