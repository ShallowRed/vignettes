# @vignettes/schemas

Deck components that explain a system on a slide: pictogram steps linked by arrows, diagrams whose cards sit on a grid or are ranked automatically, and a file read beside the description of what it holds.

```bash
pnpm add @vignettes/schemas
```

```ts
export default defineNuxtConfig({
  modules: ['@vignettes/nuxt', '@vignettes/schemas'],
})
```

The module registers its components globally and declares them to the deck contract, so `::Scheme` and the others resolve in a deck body and the parser knows their shape.

Pictograms come from `/pictograms/<folder>/<name>.svg`, served by the application from its public directory or its content space.

## Scheme: pictogram steps that build up as you speak

```markdown
:::Scheme
::Step{n="1" picto="buildings/city-hall" title="A rule"}
Written by an administration.
::
::Step{n="2" picto="digital/coding" title="Some code"}
::
:::
```

`Scheme` lays its `Step` children in a row linked by arrows. Each step is a fragment by default, so the row builds up as the speaker talks; `:fragments="false"` shows it whole. With `dim` (default `true`) the steps already shown fade once a later one is current, and the current step takes an accent frame. `size` is `sm` | `md` | `lg` and sets the pictogram scale; `tiles` is `column` (default) or `row` to put the pictogram beside the text. `:arrows="false"` gives a plain row of cards.

`Step` takes `picto`, `title` and `n` for its number badge, or `icon` for a Remix icon where a pictogram is too much. The default slot is the caption.

## Diagram: cards placed on a grid or ranked, linked by drawn arrows

```markdown
:::Diagram{layout="grid" cols="3"}
::Node{id="src" at="1,2" picto="document/contract" title="Sources"}
::
::Node{id="cat" at="2,2" picto="digital/data-visualization" title="Catalogue"}
One entry per source
::
::Node{id="api" at="3,1" picto="digital/application" title="API" :planned="true"}
::
::Edge{from="src" to="cat" label="feeds"}
::
::Edge{from="cat" to="api" :dashed="true"}
::
:::
```

`layout="grid"` places each `Node` at `at="col,row"`, spanning `span="cols,rows"`. `layout="auto"` ignores `at` and lets dagre rank the nodes, with `direction` as `LR` or `TB` and `nodeWidth` in pixels.

`Diagram` takes `gap` (a `"row col"` pair of CSS lengths), `route` (`curve`, the default, or `orthogonal` elbows), `cards` (`outlined`, the default, or `plain`), `tiles` (`column` or `row`), plus `size`, `dim` and `fragments` as on `Scheme`. `size="xs"` suits a stack of cards that has to leave room for the arrows and their labels; a node takes `orientation` to override the diagram's `tiles`.

`Edge` draws an arrow between two node ids, with `label`, `dashed`, `route` per edge, and `anchors="right,top"` to force the sides it leaves and enters by, which geometry decides otherwise. `planned` gives a node a dashed frame. `variant="entity"` turns a node into a left-aligned box whose caption lists attributes, one per list item, for data-model diagrams.

Nodes and edges are fragments in writing order, each edge appearing with the later of its nodes; `step="2"` on a node or an edge moves it in that order.

`Area` draws a named region behind the cards, so an arrow leaving it reads as data going from one machine to another. It takes `at` and `span` like a node, a `picto`, and `label` as `legend` (the title on the top border) or `header` (a centred band above the cards). Regions are not fragments.

## JsonTour: a file read beside the description of what it holds

```markdown
:::JsonTour{file="deck.json" size="xs" height="430px" panel="46%"}
::Zone{lines="2-8" picto="document/document" title="Identity"}
A name, an owner, a version.
::
::Zone{lines="9-12" picto="digital/coding" title="Content"}
The slides the deck holds.
::

```json
{ … }
```

:::
```

The fenced code block of the default slot becomes a panel pinned to the right of the slide. Each `Zone` is a fragment that highlights the `lines` it names and scrolls the panel to them. `lines` takes `12` or `12-24`, counted from the first line of the fence.

`JsonTour` takes `file` (the name shown above the panel), `height` (the panel height in slide pixels, the deck being 1280x720), `panel` (its width), `size` (`xs` | `sm` | `md`, the scale of the zone cards) and `fragments`. `Zone` takes `lines`, `picto`, `title`, `n`, and `step` to override the writing order.

`mark` and `underline` name words of the file, separated by `|`, to paint or to underline wherever they occur whole. On a `Zone`, the same two props search the zone's lines only, and the words show their mark while the zone is current. A deck that spreads a tour over several slides, one zone per slide, sets `:fragments="false"` and `:current="true"` on the zone of each slide, which takes the accent frame of the current step.

`:stack="true"` puts the panel under the zones at full width, for a narrow column beside a media pane. `image` with `alt` shows a screenshot to the right of the tour, and each `Zone` then names with `spot="x,y,w,h"`, in percent of the image, the area it frames while the rest dims.

## Colours

The cards take their tints from the DSFR illustrative palette, by name: `palette="blue-france"`, `green-emeraude`, `orange-terre-battue` and the rest of the DSFR set.
