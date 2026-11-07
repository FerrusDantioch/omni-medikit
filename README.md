# Omni-MediKit

**Omni-MediKit** est une application de suivi de traitement médical, sous forme de
PWA (Progressive Web App) fonctionnant à **100 % hors ligne**, installable sur
tablette et smartphone. Aucun backend, aucun serveur, aucune IA intégrée : toutes
les données restent localement sur l'appareil de l'utilisateur, dans IndexedDB.

## Voir l'application

Dépôt : https://github.com/FerrusDantioch/omni-medikit

Pour l'utiliser hors ligne, ouvrez une première fois la page de l'application
hébergée (GitHub Pages), puis installez-la depuis le menu du navigateur
(« Ajouter à l'écran d'accueil »). Après cette première installation, tout
fonctionne sans aucune connexion.

## Fonctionnalités

- **Profils** : plusieurs personnes suivies (prénom, date de naissance
  éventuelle, note libre), et mode « duo » pour afficher côte à côte le suivi de
  deux personnes sur la même page.
- **Traitements médicamenteux** : date de début, date de fin calculée ou saisie,
  fréquence (quotidienne, X fois par jour, jours précis de la semaine), option
  « traitement à vie » ; suivi des prises avec historique consultable ; visibilité
  immédiate des médicaments du jour, en cours, bientôt terminés et à vie.
- **Vaccins** : nom du vaccin, date de dernière injection, date de prochain
  rappel éventuelle.
- **Contacts médicaux** : médecins et professionnels de santé, globaux ou par
  personne (nom, spécialité, téléphone, adresse).
- **Urgences** : numéros d'urgence français pré-remplis (SAMU 15, Police 17,
  Pompiers 18, 112 européen, 114 sourds et malentendants, centre antipoison) avec
  appel direct en un clic via les liens `tel:`, et contact d'urgence configurable
  par personne (appel direct ou SMS pré-rédigé modifiable, via `tel:` / `sms:`).
- **Thèmes** : trois thèmes sélectionnables dans les réglages — « thème
  omni-systeme » (par défaut, inspiré du portfolio
  [omni-systeme](https://ferrusdantioch.github.io/omni-systeme/), couleur
  principale violet nuit), « sombre » et « clair ». Le choix est mémorisé
  localement et s'applique instantanément.
- **Export / import JSON** : sauvegarde manuelle complète des données.
- **Mise à jour manuelle** : un bandeau « Mettre à jour » apparaît quand une
  nouvelle version a été téléchargée, et un bouton « Mettre à jour » dans les
  réglages permet de chercher une mise à jour à tout moment. Rien ne change
  sans que l'utilisateur touche le bouton ; les données restent telles quelles.

## Technique

- HTML / CSS / JS vanilla, un seul dossier autonome, aucun build, aucune
  dépendance serveur.
- `manifest.json` + service worker enregistré, stratégie **offline-first**
  (pré-cache de la coquille applicative, puis cache à la première utilisation).
- Persistance : **IndexedDB** (profils, traitements, prises, vaccins, contacts,
  réglages dont le thème), dates gérées en local.
- Thèmes implémentés par **variables CSS** (`data-theme` sur `<html>`).
- **Versionnement** : la version figure dans le champ `version` de
  `manifest.json`, dans la constante `VERSION` de `sw.js` (nom du cache
  `omni-medikit-<version>`) et dans `VERSION_APP` de `js/app.js` — à incrémenter
  à chaque publication pour que le bouton « Mettre à jour » fonctionne.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique de l'application (structure et vues) |
| `css/style.css` | Styles et thèmes (variables CSS) |
| `js/db.js` | Couche IndexedDB |
| `js/logique.js` | Logique pure (dates, fréquences, statuts) |
| `js/app.js` | Interface, navigation, formulaires, export/import |
| `manifest.json` | Manifeste PWA (nom Omni-MediKit, icônes, mode standalone) |
| `sw.js` | Service worker, cache offline-first |
| `icons/` | Icônes de l'application (PNG + SVG) |
| `LICENSE` | Licence du code |

## Droits et licence

Code : **© 2026 Ferrus Dantioch — Creative Commons BY-NC-ND 4.0**
([résumé en français](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr)).
Texte complet dans le fichier [LICENSE](LICENSE), identique à celle du dépôt
[omni-systeme](https://github.com/FerrusDantioch/omni-systeme).

Omni-MediKit a été développée par **Ferrus Dantioch** avec l'aide de l'IA.
Découvrir les autres projets de l'auteur : https://ferrusdantioch.github.io/omni-systeme/
