# @vignettes/storybook

Embeds a live Storybook story in a slide. The deck stays in step with the design system: no screenshot to regenerate, the story renders from its own source.

```bash
pnpm add @vignettes/storybook
```

```ts
export default defineNuxtConfig({
  modules: ['@vignettes/nuxt', '@vignettes/storybook'],
})
```

A deck names its Storybook root in the frontmatter, and each embed names a story id:

```yaml
---
title: A deck
storybook: https://storybook.example.com
---
```

## One story beside the text

A `story` on the `:layout` annotation resolves to `<storybook>/iframe.html?id=<story>&viewMode=story` and renders as an iframe:

```markdown
### My component, live

:layout{name="media-right-wide" story="home-scenario-a--page" lightbox="true"}

What we are testing, next to the live story.
```

The value is the Storybook story id, `<componentId>--<storyName>`. `lightbox="true"` lets a click open the story full-screen.

## Several screens side by side

```markdown
:::Screens{cols="3" gap="1rem"}
::StoryFrame{story="home-scenario-a--page" ratio="portrait" label="A · Landing" lightbox}
::
::StoryFrame{story="home-scenario-b--page" ratio="portrait" label="B · Routing" lightbox}
::
:::
```

`Screens` takes `cols` for a fixed column count, or lays an even auto-fit row when it is omitted, plus `gap` (default `1.5rem`) and `align` (`start` | `center` | `stretch`).

`StoryFrame` takes `story`, or `src` for an explicit URL, and:

| prop | meaning |
|---|---|
| `type` | `iframe` or `image`; without it, a story or a URL is a page, and a URL ending with an image extension an image |
| `ratio` | named (`desktop` 16/10, `wide` 16/9, `classic` 4/3, `photo` 3/2, `square`, `mobile` 9/16, `portrait` 3/4) or raw, `16/9` |
| `fit` | `cover`, the default, or `contain` |
| `previewWidth` | logical iframe width before scaling, `1440` by default; raise it to show more of the page |
| `raw` | render at native size, without scaling |
| `label` | caption under the frame, or use the default slot |
| `lightbox` | click to open the screen full-screen |
| `title` | accessible iframe title, or image alt |

An iframe renders at its logical width and is scaled down to fit, so the whole page is visible rather than its top-left corner. `StoryFrame` also works on its own in a slide body, without `Screens`.

## Frozen decks

`@vignettes/freeze` copies a built Storybook into the bundle and rewrites the embeds to point at that copy, so a frozen deck keeps rendering its stories without the design system's server.
