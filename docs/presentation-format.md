# Writing a deck

A deck is a markdown document with frontmatter. Its reference lives next to the code that reads it:

- [the dialect and the generic components](../packages/nuxt/README.md): frontmatter, slide hierarchy, annotations, layouts, `Quote`, `Image`, `Columns`, `Mermaid`, `Notes`, `Fragments` and the rest.
- [the explanation kit](../packages/schemas/README.md): `Scheme`, `Diagram`, `Tags`, `JsonTour` and their props.
- [live Storybook embeds](../packages/storybook/README.md): `StoryFrame` and `Screens`.
- [themes](theme-system.md) and [backgrounds](backgrounds.md).

What follows is what belongs to this instance rather than to the packages.

## Where a deck lives

The database holds the published version of every deck; `presentations/<slug>.md` is the archive exported from it. The editor writes to the database, and `mise run content:push -- <slug>` sends a stub from the archive to a deployed instance.

A slug is lowercase, hyphenated, and stable: it is the URL of the deck. An alias declared in `presentations/registry.yml` gives a deck a second, permanent address under `/p/<alias>`, which survives the deck being frozen.

## Validation

Frontmatter is validated once, against the schema of `@vignettes/core`. An unknown key is kept and ignored, a malformed value is refused with the name of the key. The keys the database owns for a managed deck, its status and its theme, are set from the application: a value left in the frontmatter of a republished stub does not override them.

## Writing well

One idea per slide, and a heading that states it rather than naming a topic. A slide the audience reads instead of listening to is a slide too full: move the detail to the speaker notes, which `::Notes` carries into the speaker view.

Vertical slides are the place for the depth a question might call for, since the audience follows the horizontal line and the speaker steps down only if asked.

Images referenced by path come from the content space, under `assets/images/`, `assets/backgrounds/` and `assets/pictograms/`; images pasted into the editor are uploaded and addressed by their content. Both keep working when the deck moves to another instance.
