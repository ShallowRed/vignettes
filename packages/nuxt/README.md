# @vignettes/nuxt

Renders a deck in a Nuxt application: the Reveal layer, the authoring components, the two slide parsers, the theme pipeline and the French orthotypography directive.

```bash
pnpm add @vignettes/nuxt @nuxtjs/mdc
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/mdc', '@vignettes/nuxt'],
})
```

The module registers the authoring components globally, since a deck body names them in markdown and they are resolved at render time. `RevealPresentation` and `RevealSlides` are ordinary components, so their stylesheets are linked in the server-rendered page. `RevealPresentation` links the theme stylesheet in the document head and covers the deck with a loading veil until Reveal, the theme and the fonts are ready. It exposes the deck composables (`usePresentation`, `useReveal`, `useTheme` and the others of `runtime/composables`) as auto-imports; the slide helpers stay internal. It installs the plugins that seed the theme registry and the typography directive.

The host owns the routes and the content: it decides which page renders a deck, and where the markdown comes from. A page is as short as:

```vue
<script setup lang="ts">
const { presentationData } = usePresentation(useRoute().params.slug as string)
</script>

<template>
  <RevealPresentation
    v-if="presentationData"
    :theme="presentationData.metadata.theme"
    :config="presentationData.metadata.reveal"
    :lang="presentationData.metadata.lang"
  >
    <RevealSlides :presentation-data="presentationData" />
  </RevealPresentation>
</template>
```

`usePresentation(slug)` reads `{ content }`, the deck's markdown, from `/api/presentations/<slug>`, or from the URL given as its second argument. The deck fills the height of the window. A page that shows a deck among other content sets `--vignettes-deck-height` on the deck's container, for instance `100%` on a box with an aspect ratio.

## The deck

A deck is a markdown document with frontmatter:

```yaml
---
title: Presentation title # defaults to the slug
theme: dsfr # a compiled theme name, or one of its aliases
lang: fr # French orthotypography applies unless another language
parser: separator # separator (default) or heading
transition: slide # Reveal transition
center: true # vertical centering
storybook: https://sb.example # root for live story embeds
---
```

## Slides

By default, `---` separates horizontal slides and `----` vertical ones. With `parser: heading`, `#` opens the title slide, `##` starts a horizontal slide, a thematic break (`---`, `***`) outside the title slide starts one too, and `###` nests a vertical slide under it. A line inside fenced code or inside a block component (`::Name` … `::`) never separates slides. `splitSlides` of `@vignettes/core/deck` holds these rules.

Each slide is tagged with its heading level, `slide-h1`, `slide-h2` or `slide-h3`, which themes style. A section holding vertical slides is wrapped in Reveal's stack, which carries `stack-h1` or `stack-h2` instead: the wrapper is not a slide, so a rule written for a heading level cannot reach the slides nested under it.

## Annotations

An annotation is a `:tag{...}` directive the parser reads and removes from the body.

| annotation | effect |
|---|---|
| `:pretitle{text="…"}` | text above the heading |
| `:subtitle{text="…"}` | text below the heading |
| `:slide-background{image="…"}` | background for this slide, over the theme's |
| `:layout{name="…" …}` | slide layout and its props |
| `:quicklink{text="…" href="…"}` | link pinned at the bottom of the slide |

`:layout` names one of the layouts below and passes it `src`, `type` (`iframe` or `image`), `fit` (`cover` or `contain`) and `lightbox`. Without `type`, a `src` ending with an image extension is an image and any other a page. All but `full` and `grid-compact` split the slide into a content pane and a media pane; the media pane extends to the edge of the slide and the text keeps its margins.

| layout | shape |
|---|---|
| `media-right`, `media-left` | content and media side by side, the media pane one and a half times as wide as the content |
| `media-right-wide`, `media-left-wide` | the media pane takes more of the width and the content text shrinks |
| `media-right-xwide`, `media-left-xwide` | the content is a narrow column of captions beside the media pane |
| `media-below`, `media-above` | stacked: a compact heading row and a full-width media row |
| `media-cover` | the media fills the slide, the heading and the intro are drawn over it on a translucent card |
| `grid-compact` | the title row shrinks to one line and the body takes the remaining height, for a tall gallery |
| `full` | the whole slide is the body, rendered as one block |

## Components

MDC uses colons, and the count says what the component wraps: `:::Name` a container of other components, `::Name` a leaf wrapping text, `:name{…}` an inline. A parent container always takes more colons than its children.

The module ships the generic set: `Quote`, `Image`, `FullScreenImage`, `Iframe`, `Mermaid`, `IconInline` (aliased `:i`), `Columns` (aliased `TwoColumns` and `ThreeColumns`), `Column`, `SplitSlide`, `Highlight`, `Notes` and `Fragments`.

```markdown
::Image{src="/diagram.png" alt="Architecture" width="80%" :preview="true"}
Figure 1 — the architecture
::

::Quote{author="Antoine de Saint-Exupéry"}
Perfection is reached when there is nothing left to take away.
::

### :i{name="ri:timer-flash-line"} A heading with an icon
```

`Notes` renders Reveal's speaker notes, shown in the speaker view opened with the `S` key. `Fragments` reveals its list items one at a time.

`Columns` lays its children side by side and takes `size` (`xs` to `xl`) for their text scale. Without `Column` children it splits the body at a horizontal rule or at each `H3` or `H4`. With `Column` children the breaks are theirs, and each one takes `span` (a weight, `span="2"` beside `span="1"` gives two thirds and one third) or `ratio` (an explicit width, `ratio="2/3"`).

```markdown
:::columns{size="sm"}
  ::column{span="2"}
  ### The wide one
  ::

  ::column{span="1"}
  ### The narrow one
  ::
:::
```

`SplitSlide` puts its own text beside a media pane inside the body, where a `:layout` splits the whole slide: use it for one block among others on a slide that keeps its normal structure. It takes `src`, `type` (`iframe` or `image`), `ratio` (`1:1`, `1:2`, `2:1`, `1:3`, `3:1`), `reverse` to put the media first, `fit` and `lightbox`.

`Mermaid` draws a diagram in the colors and the font of the theme, and reduces it, without enlarging it, to fit the width of its column and the height the other blocks of the slide leave; the diagrams of one slide take the same reduction. For sequence diagrams it sets `mirrorActors: false`, `width: 180`, `actorMargin: 30`, `messageMargin: 14`, `boxMargin: 4`, `noteMargin: 6`, `diagramMarginY: 4` and `wrap: true`. A `%%{init: …}%%` block at the top of the diagram overrides these values.

Two more modules extend the set: `@vignettes/schemas` for the explanation kit, `@vignettes/storybook` for live story embeds. A tenant declares its own components the same way, with `registerDeckComponents` from `@vignettes/core/deck`.

## Addresses and bound attributes

An address in a deck, for `storybook`, a `src`, an `href`, a markdown link or `:slide-background`, is an `http://` or `https://` URL or a path on the site that shows the deck. An image also takes a `data:image` URL; a component lists its image props under `images` in its declaration. `isDeckUrl` of `@vignettes/core/deck` holds the rule: the schema reports another address, the parser and the renderer remove it, and the editor marks it in the `{…}` attributes of a component, an annotation or a span, and in an inline markdown link or image.

An attribute written with a colon, as `:preview="true"`, takes a JSON value: `true`, `2`, `"text"`, an array or an object. The parser removes a bound attribute whose value is not JSON, and the directives `v-bind`, `v-on`, `@` and `v-model`.

Each frame of a slide carries a sandbox and the `strict-origin-when-cross-origin` referrer policy. A frame keeps the origin of its page, except a file an account uploaded to the site (`/media/`, see `isUploadedFile`), which runs in an opaque origin, without its cookies and storage.

## Themes

A theme is a directory with a `theme.json` manifest and an SCSS entry that builds on `@vignettes/theme-kit`. The module compiles the themes it discovers in the application and in the content space to `public/themes/` when Nuxt starts, in development and for a build, and watches them in development. An application that compiles its themes in its own build script sets `vignettes: { compileThemes: false }`. `docs/theme-system.md` of the repository holds the reference.
