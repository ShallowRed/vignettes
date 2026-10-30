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

`BUILT_IN_COMPONENTS` lists what the render layer ships. `registerDeckComponents` adds to it, which is how an extension module or a tenant declares its own components: the parser then knows whether one takes the whole slide, and the renderer resolves its authoring name. A component declared with an `example` and a `description` is offered by the editor of the studio, in its help, its insert menu and its autocompletion, in the language of the interface. The example gives the attributes and the content the editor inserts, each text the same in every language or given in French and in English (`{ fr, en }`), with `${…}` placeholders; `exampleSource` writes it in the deck syntax.

```ts
import { registerDeckComponents } from '@vignettes/core/deck'

registerDeckComponents([
  {
    name: 'Scheme',
    aliases: ['scheme'],
    example: { content: [{ name: 'Step', attributes: { title: { fr: 'Étape', en: 'Step' } } }] },
    description: { fr: 'Étapes reliées par des flèches', en: 'Steps linked by arrows' },
  },
  { name: 'Step', aliases: ['step'] },
])
```

## Earlier forms

`LEGACY_FORMS` lists the forms of the earlier format that a deck may still hold and that a conversion rewrites into the current format, and `legacyMentions` finds them in a deck with the changes that convert each one. The studio editor marks them and converts them, the content import names the decks that hold one, and the reference of the deck authoring plugin lists them. A change to the format that retires a form adds its entry there.

## Entry points

`./deck`, `./render`, `./theme`, `./status`, `./slugify` and `./deck-assets`.
