# @vignettes/core

What a deck is, without a framework: the dialect contract, the metadata schema, the slide model, deck resolution, the render transforms and the theme tokens. It depends on `zod` and `js-yaml`, and runs the same on a client, a server or in a command.

```bash
pnpm add @vignettes/core
```

## Deck resolution

`resolveDeck` is the single answer to "what is the configuration of this deck?". It merges the layers a deck is made of, validates them once through the zod schema, and returns metadata, body and provenance.

```ts
import { resolveDeck } from '@vignettes/core/deck'

const { meta, body, provenance } = await resolveDeck({ raw, preset })
```

## Ports

The core declares the contracts and leaves the implementations to whoever has the I/O.

| port | answers |
|---|---|
| `ContentSource` | where a deck's markdown comes from |
| `ContentWriter` | where an edit is persisted |
| `DraftStore` | the collaborative state of a deck being written |
| `DeckParser` | how markdown becomes slides, by headings or by separators |
| `DeckRenderer` | what a writer produces from the slide model |

## The component contract

`BUILT_IN_COMPONENTS` lists what the render layer ships. `registerDeckComponents` adds to it, which is how an extension module or a tenant declares its own components: the parser then knows whether one takes the whole slide, and the renderer resolves its authoring name.

```ts
import { registerDeckComponents } from '@vignettes/core/deck'

registerDeckComponents([
  { name: 'Scheme', aliases: ['scheme'] },
])
```

## Entry points

`./deck`, `./render`, `./theme`, `./status`, `./slugify` and `./deck-assets`.
