# Pictogrammes DSFR

Copie de `@gouvfr/dsfr` 1.13.2, `dist/artwork/pictograms/` (licence MIT, hors fonte Marianne).
Chaque SVG embarque ses couleurs (bleu France, rouge Marianne, bleu clair) et se charge en `<img>`.
Utilisation dans un deck : `::Step{picto="digital/coding"}` ou `![](/pictograms/digital/coding.svg)`.

| Catégorie | Pictogrammes |
|-----------|--------------|
| buildings | city-hall, factory, house, nuclear-plant, school |
| digital | application, avatar, calendar, coding, data-visualization, in-progress, internet, mail-send, search |
| document | contract, document-add, document-download, document-signature, document, driving-licence, national-identity-card, passport, tax-stamp, vehicle-registration |
| environment | environment, food, grocery, human-cooperation, leaf, moon, mountain, sun, tree |
| health | health, hospital, vaccine, virus |
| institutions | firefighter, gendarmerie, justice, money, police |
| leisure | book, community, culture, digital-art, paint |
| map | airport, location-france, luggage, map |
| system | connection-lost, error, information, notification, padlock, success, system, technical-error, warning |

Un espace de contenu ajoute ses propres pictogrammes dans `assets/pictograms/<dossier>/` ; ils se chargent par la même URL `/pictograms/<dossier>/<nom>.svg`, servie depuis le bucket ou le dossier de contenu.
