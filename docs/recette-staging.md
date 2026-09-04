# Recette sur staging

`https://staging.slides.example.org/recette` réunit ce qu'il faut pour vérifier
une version avant de la promouvoir en prod : un jeu de données nommé, des comptes
de test pour chaque situation d'accès, et la liste des vérifications à faire.

## Activation

Le kit répond 404 tant que la variable `NUXT_RECETTE_ENABLED=1` est absente de
l'environnement du conteneur. Elle est définie dans l'environnement Infisical
`staging` du projet nuxt-slides et nulle part ailleurs ; en développement local le
kit est toujours actif (`import.meta.dev`). Le code vit dans `server/utils/recette.ts`,
`server/api/recette/`, `server/routes/auth/recette.get.ts` et `src/pages/recette.vue`.

## Accès

La page s'ouvre avec un compte **owner** (connexion Google ou GitHub habituelle).
Le serveur pose alors un laissez-passer signé (cookie `recette_pass`, 12 heures,
signé avec `NUXT_SESSION_PASSWORD`). Ce laissez-passer permet ensuite, depuis le
même navigateur, d'ouvrir l'application en tant que n'importe quel persona et de
revenir à son compte (`/auth/recette?as=me`) sans repasser par OAuth.

## Jeu de données

Toutes les lignes portent le préfixe `recette-` ; « Réinitialiser » supprime ces
lignes et les recrée, sans toucher au reste de la base.

| Élément | Slug | Ce qu'il vérifie |
|---|---|---|
| Dossier partagé | `recette-partage` | clé maîtresse éditeur du collaborateur, accès expiré, invité |
| Dossier privé | `recette-prive` | aucun accès accordé |
| Publique | `recette-public` | visible par tous ; éditeur temps réel pour le collaborateur |
| Mot de passe | `recette-mdp` | semi-privée, mot de passe `recette` ; le collaborateur le saute |
| Brouillon | `recette-brouillon` | jamais publiée, listée à qui peut l'éditer |
| Privée | `recette-privee` | 401 anonyme, 403 lecteur |
| Non listée | `recette-non-listee` | publique hors catalogue, lien direct |
| Archivée | `recette-archivee` | hors catalogue public |
| Lecture seule | `recette-lecture` | dans Divers, accès lecture du collaborateur, sans crayon |
| Corbeille | `recette-corbeille` | 404 partout, restaurable |

Comptes : `recette-owner` (owner), `recette-editeur` (éditeur), `recette-lecteur`
(lecteur sans accès), `recette-collab` (lecteur avec la clé maîtresse du dossier
partagé et un accès lecture sur « Lecture seule »), `recette-expire` (clé maîtresse
expirée la veille), plus l'invité Google `invite.recette@example.com` avec un accès
lecture sur le dossier partagé.

## Déroulé

1. Se connecter avec son compte owner, ouvrir `/recette`, cliquer « Réinitialiser ».
2. Dans chaque bloc de scénario, « Se connecter » ouvre l'application en tant que ce
   persona sur la première page à vérifier ; chaque ligne a un lien « ouvrir ».
3. Revenir sur `/recette` (favori) pour changer de persona ou revenir à son compte.

Pour tester le temps réel à deux, ouvrir l'éditeur d'une même présentation dans deux
onglets du même navigateur : les deux sessions partagent le persona courant, ce qui
suffit à voir la synchronisation et la présence. Pour deux comptes distincts, utiliser
une fenêtre privée avec un second persona (le laissez-passer n'y est pas ; ouvrir
`/recette` en owner dans cette fenêtre d'abord).
