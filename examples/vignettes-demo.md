---
title: "Vignettes, en une présentation"
status: public
theme: dsfr
parser: heading
---

# Vignettes

:subtitle{text="Des présentations en Markdown, un catalogue autour."}

Cette présentation est écrite dans un seul fichier Markdown. Elle sert d'exemple : ouvrez-la dans l'éditeur pour voir le texte à gauche et le rendu à droite.

## Le dialecte

Un deck est du Markdown, plus des composants et des annotations.

### Titres et diapositives

Avec `parser: heading`, `#` ouvre la diapositive de titre, `##` commence une diapositive horizontale et `###` en imbrique une verticale dessous. Avec `parser: separator`, qui est le réglage par défaut des thèmes fournis, `---` sépare les diapositives horizontales et `----` les verticales.

### Les composants

Un composant s'écrit avec des deux-points. Le nombre de deux-points dit ce qu'il enveloppe : `::Nom` entoure du texte, `:::Nom` contient d'autres composants, `:nom{…}` s'insère dans une phrase.

::Quote{author="Antoine de Saint-Exupéry"}
La perfection est atteinte, non pas lorsqu'il n'y a plus rien à ajouter, mais lorsqu'il n'y a plus rien à retirer.
::

### Les annotations

Une annotation est lue puis retirée du corps de la diapositive. `:subtitle{text="…"}` pose un sous-titre, `:pretitle{text="…"}` un sur-titre, `:slide-background{image="…"}` une image de fond, `:quicklink{text="…" href="…"}` un lien épinglé en bas.

## Deux colonnes

:::Columns
::Column
Le composant `Columns` répartit ses enfants. `TwoColumns` et `ThreeColumns` en sont des alias.
::

::Column
Une annotation `:layout{name="media-right" src="…"}` fait autre chose : elle réserve un panneau média à droite du texte, sur toute la hauteur.
::
:::

## Révéler point par point

::Fragments
- Chaque élément de la liste apparaît à la frappe suivante.
- L'ordre est celui de la liste.
- Les notes de l'orateur, elles, restent invisibles au public.
::

::Notes
Ces notes s'affichent dans la vue orateur, ouverte avec la touche S.
::

## Le thème

Cette présentation utilise `dsfr`, la base du Système de Design de l'État. Le thème se choisit dans le frontmatter et se change sans toucher au texte. Un thème est un dossier avec un manifeste `theme.json` et une entrée SCSS bâtie sur `@vignettes/theme-kit`.

## Et ensuite

:quicklink{text="Le format complet" href="https://github.com/ShallowRed/vignettes/blob/main/docs/presentation-format.md"}

Le catalogue range les présentations par dossier, garde un historique de versions publiées et applique des règles d'accès par présentation. L'éditeur se partage à plusieurs en temps réel. Une présentation publiée peut être gelée en un paquet statique qui fonctionne sans serveur.
