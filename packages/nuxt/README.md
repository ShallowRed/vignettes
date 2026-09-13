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

The module registers the authoring components globally, since a deck body names them in markdown and they are resolved at render time. `RevealPresentation` and `RevealSlides` are ordinary components, so their stylesheets are linked in the server-rendered page. `RevealPresentation` links the theme stylesheet in the document head and covers the deck with a loading veil until Reveal, the theme and the fonts are ready. It exposes `usePresentation`, `useReveal`, `useTheme` and the slide helpers as auto-imports, and installs the plugins that seed the theme registry and the typography directive.

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

By default, `---` separates horizontal slides and `----` vertical ones. With `parser: heading`, `#` opens the title slide, `##` starts a horizontal slide, and `###` nests a vertical slide under it.

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

`:layout` takes `media-right`, `media-left`, `media-right-wide` and `media-left-wide` for a two-column slide with a media pane, plus `src`, `type`, `fit` (`cover` or `contain`) and `lightbox`.

## Components

MDC uses colons, and the count says what the component wraps: `:::Name` a container of other components, `::Name` a leaf wrapping text, `:name{…}` an inline. A parent container always takes more colons than its children.

The module ships the generic set: `Quote`, `Image`, `FullScreenImage`, `Iframe`, `Mermaid`, `PreviewLink`, `IconInline` (aliased `:i`), `Columns` (aliased `TwoColumns` and `ThreeColumns`), `Highlight`, `Notes` and `Fragments`.

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

Two more modules extend the set: `@vignettes/schemas` for the explanation kit, `@vignettes/storybook` for live story embeds. A tenant declares its own components the same way, with `registerDeckComponents` from `@vignettes/core/deck`.

## Themes

A theme is a directory with a `theme.json` manifest and an SCSS entry that builds on `@vignettes/theme-kit`. The module compiles the themes it discovers in the application and in the content space, and watches them in development. `docs/theme-system.md` of the repository holds the reference.
