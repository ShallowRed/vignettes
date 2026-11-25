---
seo:
  title: Vignettes
  description: Écrivez, publiez, présentez.
---

::u-page-hero{:ui='{"container":"pb-10 sm:pb-12 lg:pb-16"}'}

#title

Vos présentations en Markdown

#description

Vous écrivez le texte, Vignettes le met en page aux couleurs de votre équipe.

#links

:::u-button{size="xl" to="/docs/demarrer/premiere-presentation" trailing-icon="i-lucide-arrow-right"}

Écrire une première présentation

:::

:::u-button{size="xl" to="/docs" color="neutral" variant="outline"}

Lire la documentation

:::

::

::u-container

[Modifiez le texte : la diapositive suit votre curseur.]{.block .mb-3 .text-sm .text-muted}

:::deck-playground
```mdc
---
title: Bilan du trimestre
theme: dsfr
---

### Le parcours en trois étapes

:::Scheme{:fragments="false"}
::Step{n="1" picto="document/document-add" title="Dépôt"}
L'usager remplit le formulaire.
::
::Step{n="2" picto="digital/in-progress" title="Instruction"}
Un agent vérifie les pièces.
::
::Step{n="3" picto="digital/mail-send" title="Réponse"}
L'usager reçoit un message.
::
:::

---

### La suite

:::Columns
::Column
#### Ce mois-ci
Les tests avec cinq usagers.
::

::Column
#### Le mois prochain
L'affichage sur téléphone.
::
:::

::Notes
Donner le nombre de demandes reçues.
::
```
:::

::

::u-page-section{orientation="horizontal" :ui='{"container":"py-12 sm:py-16 lg:py-20"}' headline="Écrire"}

#title

Le Markdown que vous connaissez

#description

Un titre commence une diapositive. Pour des colonnes, une citation, des étapes ou un diagramme, vous ajoutez un composant par son nom.

#features

:::u-page-feature
---
icon: i-lucide-list-checks
title: Point par point
description: Les éléments d'une liste apparaissent un à un, à chaque appui sur la flèche.
---
:::

:::u-page-feature
---
icon: i-lucide-workflow
title: Des schémas écrits en texte
description: Étapes illustrées, cartes reliées par des flèches, diagrammes Mermaid.
---
:::

:::u-page-feature
---
icon: i-lucide-monitor-smartphone
title: Stories Storybook
description: Une diapositive affiche un composant de votre Storybook, rendu en direct.
---
:::

#links

:::u-button{to="/docs/ecrire/composants" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-right"}

Les composants

:::

#default

:::deck-example{hide-source}
```mdc
---
theme: dsfr
---

### Le circuit d'une demande

:::Diagram{layout="grid" cols="3" rows="2" :fragments="false"}
::Area{at="2,1" span="2,1" title="Le service" color="purple"}
::
::Node{id="depot" at="1,1" picto="document/contract" title="Dépôt" color="green"}
::
::Node{id="instruction" at="2,1" picto="digital/data-visualization" title="Instruction" :emphasis="true"}
Une étape par agent
::
::Node{id="reponse" at="3,1" picto="digital/application" title="Réponse" :planned="true"}
::
::Node{id="pieces" at="1,2" title="Pièces" variant="flow"}
::
::Edge{from="depot" to="instruction" label="transmet"}
::
::Edge{from="instruction" to="reponse" :dashed="true"}
::
:::
```
:::

::

::u-page-section{:ui='{"container":"py-12 sm:py-16 lg:py-20"}' headline="Présenter"}

#title

Présentez depuis votre navigateur

#description

Un lien ouvre la présentation, sur un ordinateur comme sur un téléphone. Vous présentez avec vos notes, puis vous envoyez le PDF ou le texte.

#features

:::u-page-feature
---
icon: i-lucide-presentation
title: Vue conférencier
description: La diapositive suivante, un chronomètre et vos notes, dans une seconde fenêtre.
to: /docs/ecrire/presenter#la-vue-conférencier
---
:::

:::u-page-feature
---
icon: i-lucide-file-down
title: Export PDF
description: Chaque diapositive sur une page, dans un fichier à joindre à un courriel.
to: /docs/ecrire/presenter#exporter-en-pdf
---
:::

:::u-page-feature
---
icon: i-lucide-file-text
title: Le Markdown à télécharger
description: Vous téléchargez le Markdown du brouillon ou de la version publiée, pour le garder ou le faire modifier par un agent.
to: /docs/ecrire/presenter#télécharger-le-texte
---
:::

::

::u-page-section{orientation="horizontal" reverse :ui='{"container":"py-12 sm:py-16 lg:py-20","wrapper":"order-first lg:order-last"}' headline="Thèmes"}

#title

Aux couleurs de votre équipe

#description

Le thème du Système de design de l'État est fourni. Pour votre équipe, vous écrivez un thème avec ses couleurs et sa police, puis vous le choisissez par une ligne de l'en-tête de la présentation.

#links

:::u-button{to="/docs/themes/theme-de-votre-equipe" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-right"}

Écrire votre thème

:::

#default

:::deck-example{hide-source}
```mdc
---
theme: dsfr
syntax:
  split: heading
---

## Les résultats du trimestre

Trois indicateurs suivis chaque mois par l'équipe.
```
:::

::

::u-page-section{:ui='{"container":"py-12 sm:py-16 lg:py-20"}' headline="Studio"}

#title

À plusieurs, de l'écriture à la présentation

#description

Le studio range les présentations par dossier. Vous y écrivez avec vos collègues, vous publiez une version, vous choisissez qui peut la lire, puis vous présentez.

#features

:::u-page-feature
---
icon: i-lucide-users
title: Un brouillon partagé
description: Plusieurs personnes modifient la même présentation en même temps.
to: /docs/studio/versions-et-brouillon
---
:::

:::u-page-feature
---
icon: i-lucide-history
title: Des versions publiées
description: Les visiteurs voient la dernière version publiée, et l'historique garde les précédentes.
to: /docs/studio/versions-et-brouillon
---
:::

:::u-page-feature
---
icon: i-lucide-lock-keyhole
title: Un accès par présentation
description: Publique, privée ou protégée par un mot de passe, et partagée avec un compte GitHub ou Google.
to: /docs/studio/roles-et-partage
---
:::

::

::u-page-section{orientation="horizontal" :ui='{"container":"py-12 sm:py-16 lg:py-20"}' headline="Agents"}

#title

Demandez la présentation à votre agent de code

#description

Une skill donne à votre agent les règles du format. Depuis le dépôt de votre produit, il lit le code et la documentation, puis il écrit le fichier que vous importez dans le studio.

#links

:::u-button{to="/docs/ecrire/ecrire-avec-un-agent" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-right"}

Installer la skill

:::

#default

```text
/plugin marketplace add ShallowRed/vignettes-plugins
/plugin install vignettes-decks@vignettes

Écris une présentation Vignettes de six diapositives
pour la revue de sprint, dans
docs/presentations/revue-de-sprint.md.
```

::

::u-page-section{:ui='{"container":"pt-0 sm:pt-0 lg:pt-0 pb-24"}'}

:::u-page-c-t-a
---
title: Votre première présentation
description: Le tutoriel vous guide de la page blanche au lien envoyé à un collègue, puis à la présentation avec vos notes.
variant: subtle
links:
  - label: Commencer le tutoriel
    to: /docs/demarrer/premiere-presentation
    trailingIcon: i-lucide-arrow-right
  - label: Écrire avec un agent
    to: /docs/ecrire/ecrire-avec-un-agent
    color: neutral
    variant: outline
---
:::

::
