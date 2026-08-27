# Matrice d'accès et de visibilité

Qui peut ouvrir quoi, et qui voit quoi au catalogue. La décision pure vit dans
`shared/access/decide.ts` (`decideAccess` pour l'ouverture, `canList` pour la
découvrabilité) ; l'adaptateur HTTP dans `server/utils/access.ts`.

## Arbre de décision (une requête sur un deck)

1. **Deck à la corbeille ?** (`decks.deleted_at`) : 404 partout, lecture comme
   écriture (`isTrashed` dans les gardes d'édition et l'upgrade collab).
2. **Ligne `managed` ?** La base fait foi pour les axes d'accès. Sinon (deck
   jamais publié ni édité par un admin), le frontmatter décide.
3. **`decideAccess(status, role, grant, hasPassword, passwordGranted)`** :
   allow / deny (401 ou 403) / needs-password (401 + `data.requiresPassword`).
4. **`canList(status, lifecycle, role, grant, unlisted)`** : présence au
   catalogue. Lister et ouvrir sont deux axes distincts.

## Les cinq axes

| Axe | Valeurs | Décide de | Ne décide PAS de |
|---|---|---|---|
| `status` | `public` / `semi-private` / `private` | qui peut **ouvrir** | — |
| `unlisted` | bool | présence au **catalogue** public | l'ouverture (le lien direct marche) |
| `lifecycle` | `live` / `frozen` / `archived` | présence au catalogue + mode de service (bundle statique) | l'ouverture (une archivée privée reste privée) |
| `published` | dérivé (`published_version_id`) | s'il existe un contenu servable ; un deck non publié n'est listé qu'aux éditeurs | — |
| `managed` | bool | quelle source fait foi pour les métadonnées (base vs frontmatter) | l'accès lui-même |

## Sémantique des statuts

- **public** : ouvert à tous, listé à tous (sauf `unlisted`/archivé).
- **semi-private** (« Mot de passe ») : ouvert avec le mot de passe du deck
  (cookie 24 h, tentatives limitées à 10/5 min par IP). **Fail-closed** : sans
  hash défini, personne n'ouvre — l'UI bloque l'enregistrement de cet état sans
  mot de passe. Jamais listé au public (atteint par lien).
- **private** : rôles privilégiés (Éditeur/Owner globaux) et titulaires d'un
  grant. Jamais listé au public.

## Grants (escalade ciblée)

- **Par deck** (`deck_permissions`) : `viewer` ouvre la lecture, `editor` ouvre
  l'édition, sur CE deck. Un grant fait aussi apparaître le deck au catalogue du
  titulaire, statut et `unlisted` compris.
- **Par dossier** (`project_permissions`, « clé maîtresse ») : même chose sur
  TOUS les decks du projet. Le fold prend le plus fort des deux
  (`strongerGrant`).
- Un grant ne donne jamais `admin` (gestion des accès = rôle global owner).
- Le mot de passe et les grants sont **orthogonaux** : le mot de passe couvre le
  partage sans compte (démo client), le grant couvre la collaboration
  identifiée. Un titulaire de grant saute le mot de passe.

## Piège historique (corrigé)

À la publication, `content-store.writer.save` re-dérivait TOUS les axes du
frontmatter, écrasant les choix admin (`managed`). Depuis le correctif : une
ligne `managed` **conserve** ses axes d'accès (`status`, `unlisted`, hash) à la
republication ; seuls les axes de contenu (titre, thème, projet) suivent le
frontmatter. Le premier publish d'un deck dérive encore tout du frontmatter.

## Décision : gestion des accès owner-only

Les grants, invitations et comptes se gèrent avec le rôle global **owner**
uniquement, alors que les métadonnées (statut compris) sont ouvertes aux
éditeurs. C'est volontaire pour un produit solo : moins de surface d'escalade
(un éditeur ne peut pas s'ouvrir des accès), moins de cas à tester. Si le
produit devient réellement multi-tenant, la granularité « owner de projet »
(gérer les accès de son seul dossier) est la première marche à construire —
pas avant.
