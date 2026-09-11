# Thèmes, marques, assets et bundles : séparation moteur / tenant

> Note de conception, septembre 2026. Décrit la cible et l'ordre des chantiers ; l'état d'avancement est dans le code, pas ici.

## Constat

Un thème est aujourd'hui réparti en cinq endroits du dépôt applicatif : le SCSS dans `themes/<name>/`, la liste de compilation dans `themes/themes.config.js`, les données dans `shared/theme/tokens.ts` (fonds, dimensions Reveal, langue, parseur), les fonds dans `public/backgrounds/`, les polices dans `public/fonts/`. Ajouter le thème d'un client touche ces cinq endroits, et `KNOWN_THEMES` valide le frontmatter contre cette liste écrite à la main.

Le thème `dsfr` du dépôt est déjà une marque : il lit des variables `$as-*`, ses fonds `slide-bg-*.png` sont ceux d'aides simplifiées, ses pictogrammes `custom/` ont été dessinés pour le registre de règles. `brand` est le même montage pour une autre marque. Les images de deck historiques sont des fichiers de `public/images/` référencés en chemin absolu : elles vivent dans le dépôt de code, sont publiques quel que soit le statut du deck, et ne suivent pas le deck d'une instance à l'autre. La production des bundles gelés est écrite pour un projet précis (valeurs par défaut du `Makefile`, thème `brand` par défaut).

## Cible : trois couches

**Moteur** (dépôt applicatif, package `theme-kit`) : le contrat de tokens sémantiques (`--accent`, `--surface`, `--text-title`, …), les patches Reveal, les layouts média, la structure des slides, les presets d'échelle. Sans marque, sans couleur.

**Base DSFR** (dépôt applicatif, package `theme-dsfr`) : la couche « système de design de l'État », utilisable par tout contexte public et faite pour être étendue : palette DSFR, typographie Marianne, preset `dsfr-layout`, pictogrammes officiels, orthotypographie française, fonds neutres peints en CSS. Utilisable telle quelle avec `theme: dsfr`. La fonte Marianne n'est pas sous licence MIT : le package la prend dans la dépendance npm `@gouvfr/dsfr` au build, elle n'est pas committée.

**Marques** (espace de contenu du tenant) : un dossier autoporteur par marque, avec un manifeste, qui étend la base DSFR ou le moteur seul. Pour ce tenant : `brand-a` (l'actuel `dsfr` moins ce qui remonte en base, plus ses fonds, ses pictogrammes et ses variables) et `brand`.

## Espace de contenu

Le dépôt de contenu (sous-module `presentations/`, variable `NUXT_CONTENT_DIR`) devient l'espace complet d'un tenant :

```
presentations/
  *.md                 # stubs des decks
  projects.yml, registry.yml
  assets/              # images des decks, téléversées vers le magasin media à l'import
  themes/
    brand-a/
      theme.json
      brand-a.scss
      assets/          # fonds, pictogrammes propres à la marque
    brand/
```

Un autre utilisateur fait pareil avec son propre dépôt ou un simple dossier. Le dépôt applicatif ne contient que le moteur, la base DSFR, `minimal`, et les composants génériques.

## Manifeste de thème

```json
{
  "name": "brand-a",
  "extends": "dsfr",
  "aliases": ["dsfr"],
  "lang": "fr",
  "parser": "separator",
  "reveal": { "slideNumber": true, "width": 1200, "height": 800 },
  "backgrounds": { "h1": "assets/slide-default.png", "h2": "assets/slide-contrast.png", "h3": "assets/slide-subtle.png" }
}
```

`build-themes` découvre les thèmes dans `themes/` du dépôt applicatif et dans `themes/` de l'espace de contenu, compile chaque SCSS vers `public/themes/<name>.css`, copie `assets/` vers `public/themes/<name>/`, et génère `KNOWN_THEMES` et les tokens à partir des manifestes. Les chemins de fonds sont relatifs au dossier du thème. `aliases` permet à un tenant de faire pointer un nom de thème déjà présent dans ses stubs vers sa marque, sans republier les decks. Un thème publié sur npm se déclare par son nom dans la configuration et se résout de la même manière qu'un dossier.

## Composants de domaine

Les composants MDC sont compilés dans l'application et ne suivent pas un dossier de thème. `Step`, `Tags`, `Diagram`, `JsonTour`, `Scheme` sont génériques et restent. `RuleCard` et `PictoCard` décrivent le registre de règles ; ils partiront avec la marque le jour où un mécanisme d'extension par tenant existe (une couche Nuxt par tenant est le mécanisme naturel, qui pourrait aussi porter les thèmes). Ce chantier ne l'inclut pas.

## Assets de deck

Règle : `public/` ne contient que ce dont l'application a besoin. Deux magasins pour les images de deck :

- les téléversements de l'éditeur vont dans `media` (clé = hash du contenu, bucket, route `/media/<hash>`) ;
- les fichiers de l'archive vivent dans `assets/<préfixe>/` de l'espace de contenu (`images`, `backgrounds`, `pictograms`) et gardent leur URL : `/images/x.png` est servi depuis `assets/images/x.png` du bucket sur une instance déployée (`mise run assets:push --apply` le remplit, fichiers inchangés ignorés), depuis le dossier de contenu en développement. Les fichiers que l'application embarque sous les mêmes préfixes (`public/pictograms/`, `public/images/placeholder.svg`) restent statiques et servis en premier.

Adresser les assets par chemin plutôt que par hash évite de réécrire les decks publiés et les brouillons en ligne : le déplacement des fichiers hors du dépôt de code ne change aucune URL. Le contrôle d'accès par deck sur les images privées reste possible dans ces routes sans réécrire les decks.

## Bundles gelés

Le stockage `frozen/<alias>/` et la route `/frozen/**` derrière la garde d'accès restent. La production d'un bundle se paramètre par deck (le frontmatter porte déjà `storybook:`) et par tenant ; le thème vient du deck. Les cibles `bundle-frozen`, `upload-frozen`, `host-frozen` deviennent des tâches mise avec arguments ; `pull-note`, les cibles CodiMD et le thème par défaut `brand` disparaissent.

## Ordre des chantiers

1. `theme-kit` et `theme-dsfr` en packages du workspace ; manifestes ; génération des tokens. Vérification : CSS compilé identique avant et après pour chaque thème existant.
2. Extraction des marques `brand-a` et `brand` vers l'espace de contenu ; suppression de `dsfr-alt`, dont la base DSFR et les marques reprennent le rôle de démonstration.
3. Assets : `assets/` dans l'espace de contenu, routes `/images`, `/backgrounds`, `/pictograms` servies depuis le bucket, `assets:push`.
4. Bundles : paramétrage par deck, tâches mise, retrait du `Makefile`.
5. Purge des chemins de marque et de client dans l'historique, puis renommage du projet.
