# Recette et démonstration

`/recette` réunit ce qu'il faut pour vérifier une version avant de la promouvoir en prod : un jeu de données nommé, des comptes de test pour chaque situation d'accès, et la liste des vérifications à faire. Sur une instance neuve, la page remplit aussi le catalogue en un clic, ce qui permet de voir l'application avec du contenu.

[examples/](../examples/README.md) fournit un exemple de présentation.

## Activation

Le kit répond 404 tant que la variable `NUXT_RECETTE_ENABLED=1` est absente de l'environnement du conteneur ; en développement local il est toujours actif (`import.meta.dev`). Sur l'instance de référence, seule l'instance de staging définit cette variable. Le code est dans `server/utils/recette.ts`, `server/api/recette/`, `server/routes/auth/recette.ts` et `src/pages/recette.vue`.

En développement, la page `/recette/branche` montre les questions de la branche avec leurs captures, que décrit un fichier `test/recette/<sujet>.yaml` : [CONTRIBUTING.md](../CONTRIBUTING.md#local-acceptance) en donne le format.

Là où le kit s'ouvre, le menu du compte contient aussi l'entrée « Thème d'interface » : on y essaie un autre thème, et le navigateur garde ce choix dans le cookie `ui_theme`.

## Accès

La page s'ouvre avec un compte **owner** (connexion Google ou GitHub habituelle). Le serveur pose alors un laissez-passer scellé (cookie `recette_pass`, 12 heures, scellé avec `NUXT_SESSION_PASSWORD`). Ce laissez-passer permet ensuite, depuis le même navigateur, d'ouvrir l'application en tant que n'importe quel persona et de revenir à son compte par le bouton « Revenir à mon compte », sans repasser par OAuth.

Un script qui fait la recette dans un navigateur, celui d'un agent par exemple, ouvre le kit avec un jeton d'accès d'un compte owner, de portée « Lecture et écriture » : il envoie `POST /auth/recette` avec l'en-tête `Authorization: Bearer <jeton>` et le corps `as=<persona>&redirect=<chemin>`, et le navigateur reçoit la session du persona. Le jeton ouvre les personas dont le rôle est inférieur à owner ; `as=me` et le persona `owner` répondent 403, car la révocation d'un jeton laisse courir la session qu'il a ouverte. Sur l'instance de référence, ce jeton est rangé dans Infisical, à la racine de l'environnement `staging`, sous `RECETTE_TOKEN`, et `mise run recette:session -- <persona>` écrit la session du persona dans un état de stockage de Playwright.

## Jeu de données

Toutes les lignes portent le préfixe `recette-`. Le jeu de données est défini dans `server/utils/recette.ts` (`SEED_DECKS`). Une instance qui définit `NUXT_RECETTE_ENABLED=1` le crée à son démarrage quand il est absent ou incomplet (`server/plugins/recette-dataset.ts`) : ajouter un deck à `SEED_DECKS` le fait apparaître au déploiement suivant. Une instance où le kit ne peut pas s'ouvrir supprime au démarrage ce que le kit a créé, désigné exactement : les decks de `SEED_DECKS` par slug, les comptes des personas par identifiant, et les deux dossiers quand ils ne contiennent plus rien. Un deck qui partage seulement le préfixe `recette-` reste en place. En développement, le jeu de données se crée depuis la page. Le bouton s'appelle « Créer » tant que le jeu de données est incomplet, « Réinitialiser » ensuite ; il supprime ces lignes et les recrée, sans toucher au reste de la base.

Chaque deck porte un bloc de code. « Publique » et « Privée » portent aussi une image téléversée, servie avec la visibilité de son deck.

| Élément | Slug | Ce qu'il vérifie |
|---|---|---|
| Dossier partagé | `recette-partage` | clé maîtresse éditeur du collaborateur, accès expiré, invité |
| Dossier privé | `recette-prive` | aucun accès accordé |
| Publique | `recette-public` | visible par tous ; éditeur temps réel pour le collaborateur ; son image s'affiche hors connexion |
| Mot de passe | `recette-mdp` | semi-privée, mot de passe `recette` ; le collaborateur le saute |
| Brouillon | `recette-brouillon` | jamais publiée, listée à qui peut l'éditer |
| Privée | `recette-privee` | 401 anonyme, 404 lecteur connecté, comme un deck inexistant ; son image répond 404 hors connexion |
| Non listée | `recette-non-listee` | publique hors catalogue, lien direct |
| Archivée | `recette-archivee` | hors catalogue public |
| Lecture seule | `recette-lecture` | dans Divers, accès lecture du collaborateur, sans crayon |
| English deck | `recette-english` | publique, `lang: en` : commandes du deck en anglais |
| Corbeille | `recette-corbeille` | 404 partout, restaurable |

Comptes : `recette-owner` (owner), `recette-editeur` (éditeur), `recette-lecteur`
(lecteur sans accès), `recette-collab` (lecteur avec la clé maîtresse du dossier
partagé et un accès lecture sur « Lecture seule »), `recette-expire` (clé maîtresse
expirée la veille), plus l'invité Google `invite.recette@example.com` avec un accès
lecture sur le dossier partagé.

## Déroulé

1. Se connecter avec son compte owner, ouvrir `/recette`, cliquer « Réinitialiser » pour repartir d'un jeu de données neuf.
2. Dans chaque bloc de scénario, chaque ligne a un lien « ouvrir en tant que ce compte » : il bascule la session du navigateur sur le persona du scénario, visiteur sans session compris, puis ouvre la page à vérifier dans un nouvel onglet.
3. Revenir sur `/recette` (favori) pour changer de persona ou revenir à son compte.

Pour tester le temps réel à deux, ouvrir l'éditeur d'une même présentation dans deux
onglets du même navigateur : les deux sessions partagent le persona courant, ce qui
suffit à voir la synchronisation et la présence. Pour deux comptes distincts, utiliser
une fenêtre privée avec un second persona (le laissez-passer n'y est pas ; ouvrir
`/recette` en owner dans cette fenêtre d'abord).
