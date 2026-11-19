---
title: "Recette · Export PowerPoint"
status: private
theme: dsfr
client: Direction de l'essai
storybook: https://storybook.example.org
---

# Export PowerPoint

:subtitle{text="Chaque élément du deck, en texte, en image ou en cadre dans le fichier"}

::Notes
Les notes de la diapositive de titre.
::

---

## Le texte

---

:pretitle{text="Texte"}

### Paragraphes et listes

Un paragraphe avec du **gras**, de l'*italique*, du `code en ligne` et [un lien](https://vignettes.io) ; préparé pour {{ client }}.

- Un premier point.
- Un deuxième point, avec une sous-liste :
  - un point imbriqué ;
  - un autre point imbriqué.

1. Une étape numérotée.
2. Une seconde étape.

::Notes
Ce que l'orateur dit sur les **paragraphes**.

- Une note en liste.
::

---

### Tableau et code

| Élément | Forme dans le fichier |
| --- | --- |
| Titre | Texte de l'espace réservé |
| Tableau | Tableau PowerPoint |

```ts
export function delai(jours: number): string {
  return `${jours} jours`
}
```

---

### Citation et message clé

::Quote{author="Camille Martin" role="Cheffe de projet"}
La présentation se retouche dans PowerPoint.
::

::Highlight
Le titre et le corps vont dans les espaces réservés du masque.
::

---

### Deux colonnes

:::Columns
::Column
La colonne de gauche, avec `du code`.
::
::Column
La colonne de droite.
::
:::

::Colums
Un composant mal orthographié garde son texte.
::

---

## Les images

---

### Image et légende

::Image{src="/images/placeholder.svg" alt="Une image d'exemple"}
La légende de l'image.
::

----

### Image d'un autre site sans CORS

![Le logo d'un site qui refuse la lecture par un autre site](https://www.python.org/static/img/python-logo.png)

---

### Une image à droite

:layout{media="right" size="1/2" src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg" alt="Une photo d'exemple"}

Le texte occupe la moitié gauche de la diapositive, et l'image la moitié droite.

---

### Une image derrière le texte, sous un voile

:layout{media="behind" src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg" veil="60%" alt="Une photo d'exemple"}

Le texte est blanc sur l'image assombrie.

---

### Une image absente derrière le texte

:layout{media="behind" src="https://www.python.org/static/img/python-logo.png" veil="60%"}

Le voile reste dessiné quand l'image manque.

---

## Les cadres

---

### Une story à droite

:layout{media="right" size="2/3" story="compositions-job-board--in-progress"}

Une story devient un cadre avec un lien vers elle.

---

### Un schéma

:::Diagram{layout="grid"}
::Node{id="a" at="1,1" title="Source"}
::
::Node{id="b" at="2,1" title="Destination"}
::
::Edge{from="a" to="b" label="alimente"}
::
:::

:quicklink{text="La documentation des schémas" href="https://vignettes.io/docs"}

---

### Titre masqué

:layout{heading="hidden"}

Le titre de cette diapositive reste hors du fichier.
