# @vignettes/storybook

Embeds a live Storybook story in a slide. The slide loads the story from the published Storybook, and shows the component as that Storybook renders it when the deck opens.

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

:layout{media="right" size="2/3" story="home-scenario-a--page" lightbox}

What we are testing, next to the live story.
```

The value is the Storybook story id, `<componentId>--<storyName>`. `lightbox` lets a click open the story full-screen.

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

- `type` is `iframe` or `image`. Without it, a story or a URL renders as a page, and a URL ending with an image extension as an image.
- `ratio` is a name (`desktop` 16/10, `wide` 16/9, `classic` 4/3, `photo` 3/2, `square`, `mobile` 9/16, `portrait` 3/4) or a raw ratio such as `16/9`.
- `fit` is `cover`, the default, or `contain`.
- `viewport` is the logical iframe width before scaling, `1440` by default; raise it to show more of the page.
- `raw` renders the frame at native size, without scaling.
- `label` is the caption under the frame; the default slot takes a caption too.
- `lightbox` opens the screen full-screen on click.
- `title` is the accessible iframe title, or the image alt.

An iframe renders at its logical width and the frame scales it down to fit, so the frame shows the whole page. `StoryFrame` also works on its own in a slide body, without `Screens`.

## Frozen decks

`@vignettes/freeze` copies a built Storybook into the bundle and rewrites the embeds to point at that copy, so a frozen deck renders its stories from the bundle.
