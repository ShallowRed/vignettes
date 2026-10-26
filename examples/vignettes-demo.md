---
title: "Vignettes, en une présentation"
status: public
theme: dsfr
parser: heading
---

# Vignettes

:subtitle{text="Des présentations écrites en Markdown et rangées dans un catalogue"}

Cette présentation est écrite dans un seul fichier Markdown. Dans l'éditeur, le texte est à gauche et le rendu à droite.

## Le dialecte

Une présentation est écrite en Markdown, avec des composants et des annotations.

### Titres et diapositives

Avec `parser: heading`, un titre `#` produit la diapositive de titre, un titre `##` commence une diapositive horizontale et un titre `###` ajoute une diapositive verticale sous elle. Avec `parser: separator`, le réglage par défaut des thèmes fournis, une ligne `---` sépare les diapositives horizontales et une ligne `----` sépare les verticales.

### Les composants

On écrit un composant avec des deux-points. Leur nombre indique ce que contient le composant : `::Nom` entoure du texte, `:::Nom` contient d'autres composants, `:nom{…}` est inséré dans une phrase.

::Quote{author="Antoine de Saint-Exupéry"}
La perfection est atteinte, non pas lorsqu'il n'y a plus rien à ajouter, mais lorsqu'il n'y a plus rien à retirer.
::

### Les annotations

Le moteur lit une annotation puis la retire du corps de la diapositive. `:subtitle{text="…"}` ajoute un sous-titre, `:pretitle{text="…"}` un sur-titre, `:slide-background{image="…"}` une image de fond, `:quicklink{text="…" href="…"}` un lien en bas de la diapositive.

## Deux colonnes

:::Columns
::Column
Le composant `Columns` place les blocs `Column` côte à côte. `TwoColumns` et `ThreeColumns` sont deux autres noms du même composant.
::

::Column
Un bloc `Column` contient du texte, une liste, une image ou un autre composant.
::
:::

## Un texte et une image

:layout{media="right" src="/images/placeholder.svg"}

Avec `:layout{media="right" src="…"}`, le texte occupe la moitié gauche de la diapositive et l'image la moitié droite. `size="2/3"` donne les deux tiers à l'image, et `media` la place à gauche, en haut, en bas ou derrière le texte. Quand vous déposez une image dans l'éditeur, l'éditeur la téléverse et insère à l'endroit du dépôt un bloc `::Image` qui contient son adresse. Pour placer l'image à droite, copiez cette adresse dans `src`.

## Révéler point par point

::Fragments
- Chaque appui sur la flèche droite affiche l'élément suivant de la liste.
- Les éléments apparaissent dans l'ordre de la liste.
::

::Notes
La touche S ouvre la vue orateur, qui affiche ces notes.
::

## Le thème

On choisit le thème avec la clé `theme` du frontmatter. Un thème est un dossier qui contient un manifeste `theme.json` et une entrée SCSS construite sur `@vignettes/theme-kit`.

## Et ensuite

:quicklink{text="Le format complet" href="https://github.com/ShallowRed/vignettes/blob/main/docs/presentation-format.md"}

Le catalogue classe les présentations par dossier, garde un historique des versions publiées et applique des règles d'accès à chaque présentation. Plusieurs personnes peuvent modifier la même présentation en même temps dans l'éditeur. On peut geler une présentation publiée en un paquet statique, qui fonctionne sans serveur.
