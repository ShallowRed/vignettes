# Examples

`vignettes-demo.md` is a deck that shows the dialect: the heading parser, the components, the annotations, the DSFR theme.

`controle-du-theme.md` is the deck that checks a team theme; it uses the `exemple-marque` theme.

Load both into a running instance:

```bash
node scripts/content-import.ts --content=examples --apply
```

The new presentation dialog of the studio offers it as the Example template.

`registry.yml` gives the demo deck the lifecycle `frozen` and the bundle name `vignettes-demo`, which is how a frozen deck is declared. To publish the demo on an instance: `mise run freeze -- vignettes-demo` builds and uploads the bundle, then `mise run content:push -- vignettes-demo --content examples --unlisted --apply` creates the deck, which answers at `/p/vignettes-demo`.

`themes/exemple-sombre` and `themes/exemple-marque` are two themes written with the tokens of `@vignettes/theme-kit` and its base skin; `exemple-marque` also paints its section slides and fills the catalog preview. With `NUXT_CONTENT_DIR=examples`, `pnpm build:themes` compiles them and a deck selects one with `theme: exemple-sombre`.

`controle-du-theme.md` shows each slide role and each element a theme colors, on `exemple-marque`; `docs/theme-system.md` describes how to check a theme with it.

The nine decks of the acceptance kit cover every access situation, with five personas to browse them as. Open `/recette` on a development instance and press Create. [docs/recette-staging.md](../docs/recette-staging.md) describes it.
