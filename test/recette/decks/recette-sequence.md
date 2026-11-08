---
title: "Recette · Séquence"
status: private
theme: minimal
syntax:
  split: heading
---

# Recette · Séquence

## Échanges

:::Sequence
::Actor{id="a" icon="ri:user-line" title="Utilisatrice"}
::
::Actor{id="b" icon="ri:server-line" title="API"}
::
::Message{from="a" to="b" label="Demande"}
::
::Message{from="b" to="a" label="Réponse"}
::
::Remark{over="a,b"}
Fin de l'échange
::
:::
