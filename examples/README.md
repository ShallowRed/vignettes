# Examples

`vignettes-demo.md` is a deck that shows the dialect: the heading parser, the components, the annotations, the DSFR theme.

Load it into a running instance:

```bash
node scripts/content-import.ts --content=examples --apply
```

Or create a deck from the catalog and paste the file's contents into the editor.

`registry.yml` gives the demo deck the lifecycle `frozen` and the bundle name `vignettes-demo`, which is how a frozen deck is declared. To publish the demo on an instance: `mise run freeze -- vignettes-demo` builds and uploads the bundle, then `mise run content:push -- vignettes-demo --content examples --unlisted --apply` creates the deck, which answers at `/p/vignettes-demo`.

`themes/exemple-sombre` and `themes/exemple-marque` are two themes written with the nine tokens of `@vignettes/theme-kit` and its base skin. With `NUXT_CONTENT_DIR=examples`, `pnpm build:themes` compiles them and a deck selects one with `theme: exemple-sombre`.

The nine decks of the acceptance kit cover every access situation, with five personas to browse them as. Open `/recette` on a development instance and press Create. [docs/recette-staging.md](../docs/recette-staging.md) describes it.
