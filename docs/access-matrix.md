# Matrice d'accès et de visibilité

Qui peut ouvrir quoi, et qui voit quoi au catalogue. La décision pure vit dans
`layers/studio/shared/access/decide.ts` (`decideAccess` pour l'ouverture, `canList` pour la
découvrabilité) ; l'adaptateur HTTP dans `layers/studio/server/utils/access.ts`.

## Arbre de décision (une requête sur un deck)

1. **Deck à la corbeille ?** (`decks.deleted_at`) : 404 partout, lecture comme
   écriture (`isTrashed` dans les gardes d'édition et l'upgrade collab).
2. **Ligne `managed` ?** La base fait foi pour les axes d'accès. Sinon (deck
   jamais publié ni édité par un admin), le frontmatter décide.
3. **`decideAccess(status, role, grant, hasPassword, passwordGranted)`** : allow / deny / needs-password (401 + `data.requiresPassword`). Sur la lecture, un refus répond 401 à un anonyme et 404 à un compte connecté, la réponse d'un slug inexistant. Sur l'édition, il répond 403 à qui peut lire le deck et 404 sinon.
4. **`canList(status, lifecycle, role, grant, unlisted)`** : présence au
   catalogue. Lister et ouvrir sont deux axes distincts.

## Les cinq axes

| Axe | Valeurs | Décide de | Ne décide PAS de |
|---|---|---|---|
| `status` | `public` / `semi-private` / `private` | qui peut **ouvrir** | rien |
| `unlisted` | bool | présence au **catalogue** public | l'ouverture (le lien direct marche) |
| `lifecycle` | `live` / `frozen` / `archived` | présence au catalogue + mode de service (bundle statique) | l'ouverture (une archivée privée reste privée) |
| `published` | dérivé (`published_version_id`) | s'il existe un contenu servable ; un deck non publié n'est listé qu'aux éditeurs | rien |
| `managed` | bool | quelle source fait foi pour les métadonnées (base vs frontmatter) | l'accès lui-même |

## Sémantique des statuts

- **public** : ouvert à tous, listé à tous (sauf `unlisted`/archivé).
- **semi-private** (« Mot de passe ») : ouvert avec le mot de passe du deck. Le cookie dure 24 h et porte une signature HMAC du slug, de l'expiration et du hash du mot de passe : changer le mot de passe invalide les cookies émis. Les tentatives sont limitées à 10 par 5 min et par IP. **Fail-closed** : sans hash défini, personne n'ouvre ; l'UI bloque l'enregistrement de cet état sans mot de passe. Jamais listé au public (atteint par lien).
- **private** : rôles privilégiés (Éditeur/Owner globaux) et titulaires d'un
  grant. Jamais listé au public.

### Images téléversées

Une image de `/media/<hash>.<ext>` est servie avec la visibilité des decks qui la référencent : la table `deck_media` associe chaque image aux decks dont le texte la cite, et la route sert le fichier dès qu'un de ces decks est ouvert au visiteur. Un refus répond 404, comme une image qu'aucun deck vivant ne référence. Les associations sont écrites au téléversement et à chaque écriture du texte d'un deck, et supprimées à la purge du deck : un deck qui a cité une image continue de l'ouvrir après l'avoir retirée de son texte.

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
(gérer les accès de son seul dossier) est la première extension à construire,
et seulement à ce moment-là.

## Collaborateurs (rôle global `viewer` + grant `editor`)

Un compte invité qui ne détient qu'un grant `editor` (deck ou dossier) doit
pouvoir travailler comme un éditeur sur ce périmètre. Ce que le serveur lui
accepte, et que l'UI lui montre :

| Action | Collaborateur (grant `editor`) | Où |
|---|---|---|
| Ouvrir l'éditeur, enregistrer, publier | oui, sur le deck du grant | `assertCanEditDeck` |
| Rejoindre la session temps réel | oui, sur le deck du grant | `canActorEditDeck` (upgrade) |
| Téléverser une image | oui, via `?deck=<slug>` vérifié contre le grant | `api/media.post.ts` |
| Créer une présentation | oui, dans un dossier où il a un grant `editor` | `assertCanCreateInProject` |
| Voir le crayon au catalogue | oui (`canEdit` par deck, `myGrant` par dossier) | `mayEdit` dans `utils/catalog.ts` |
| Modifier les métadonnées d'accès (statut, mot de passe, dossier) | non : rôle global éditeur/owner | `PATCH /:slug` |
| Gérer les accès, corbeille, comptes | non : owner | |

## Édition concurrente

- L'éditeur ouvre **en temps réel par défaut** (Yjs via Hocuspocus dans Nitro) :
  chaque frappe est fusionnée, la présence affiche le nom des pairs.
  `?solo` désactive la session pour un deck donné (enregistrement manuel ; le
  lien est proposé quand la connexion au temps réel est perdue).
- Une sauvegarde solo porte le `stamp` du brouillon chargé ; si quelqu'un a
  enregistré entre-temps, le serveur refuse (`409`, `data.conflict`) au lieu
  d'écraser. Un client sans `stamp` reste accepté.
- Le brouillon et le publié sont deux textes. L'éditeur affiche « Brouillon
  synchronisé » (temps réel), puis « Modifications non publiées » ou « Publié à
  jour » selon que le brouillon diffère du publié ; le catalogue porte le même
  signal sur la carte pour qui peut éditer. `/slides/<slug>?draft` montre le
  brouillon tel qu'il sera publié, réservé à qui peut éditer.
- Le seed depuis le publié est sérialisé par deck : deux premières connexions
  simultanées ne dupliquent pas le contenu.
