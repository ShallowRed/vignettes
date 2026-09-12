# Background images

Each `<section>` receives a `data-background-image` attribute resolved by `resolveSlideBackground` in `packages/core/src/render/transforms.ts`, in this order:

1. the per-slide annotation `:slide-background{image="..."}`, extracted by the parser and never rendered;
2. the `backgrounds:` block of the deck frontmatter;
3. the theme's backgrounds, declared in its `theme.json` (see [theme-system.md](theme-system.md));
4. none.

## Per-slide override

```markdown
## Section title
:slide-background{image="/backgrounds/section.png"}

Slide body content here...
```

## Per-deck backgrounds

```yaml
---
theme: dsfr
backgrounds:
  h1: /backgrounds/custom-title.jpg
  h2: /backgrounds/custom-section.jpg
  h3: /backgrounds/custom-vertical.jpg
  default: /backgrounds/custom-default.jpg
---
```

Every field is optional: a level left out falls back to the theme; `backgrounds: {}` disables every background of the deck.

## Where the files live

- Theme backgrounds: `themes/<name>/assets/` next to the manifest, served at `/themes/<name>/assets/...`.
- Deck backgrounds: `assets/backgrounds/` of the content space, referenced as `/backgrounds/<file>`, served from object storage on a deployment and from `presentations/assets/` in development (`mise run assets:push --apply` publishes them).
- Absolute URLs (`https://...`) work as well.

## Reveal.js attributes

Only `data-background-image` is set. The other Reveal background attributes (`data-background-size`, `-position`, `-repeat`, `-opacity`, `-color`) need a custom component.

## Recommendations

- H1: bold images (logos, gradients); H2: subtle patterns; H3: lighter still, the text comes first.
- Compress images (under 500 KB), 1920x1080 or 2560x1440.
- Keep WCAG AA contrast (4.5:1) between text and image; a theme can add an overlay:

```scss
.reveal section.slide-h1[data-background-image] {
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
  }

  > * {
    position: relative;
    z-index: 1;
  }
}
```
