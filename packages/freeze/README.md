# @vignettes/freeze

Freezes one deck into a self-contained static bundle: no server, no database, no Nuxt runtime. A published link keeps its URL and keeps working, served from the bundle.

```bash
pnpm add @vignettes/freeze
```

```ts
import { buildFreezeDescriptor, freezeDeck } from '@vignettes/freeze'

const descriptor = buildFreezeDescriptor({ alias: 'my-deck', slug: 'my-deck' }, { theme: 'dsfr' })

freezeDeck({
  root: process.cwd(),
  descriptor,
  raw: markdown,
  upload: (bundle, dir) => publish(bundle, dir),
})
```

The caller brings the deck and the way to publish it. `build` names the command that generates the static site, `pnpm generate` by default, and `deckPath` where that site puts the deck page, `slides/<slug>` by default. The package builds the application in bundle mode against a reduced public directory holding only the deck's theme and what that theme's stylesheet points at, carries the assets the deck references, makes every stylesheet URL relative so the bundle renders wherever it is served, embeds a built Storybook when the deck shows stories, and writes the markdown and a provenance record beside the output.

`readBundleConfig` from `@vignettes/freeze/bundle` reads the environment the build sets, and belongs in the host's Nuxt configuration.
