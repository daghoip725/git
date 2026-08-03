# Daghoip Ikassa — Les petites annonces du Gabon

Plateforme de petites annonces conçue pour le marché gabonais : publication
gratuite, prix en francs CFA, villes et provinces du Gabon, contact par
téléphone ou WhatsApp, et une interface pensée pour les connexions mobiles.

**Stack** — Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind
CSS 4 · Supabase (PostgreSQL, Auth, Storage) · Zod · Docker.

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Configuration Supabase](#configuration-supabase)
3. [Variables d’environnement](#variables-denvironnement)
4. [Structure du projet](#structure-du-projet)
5. [Architecture](#architecture)
6. [Paiements](#paiements)
7. [Aides intelligentes](#aides-intelligentes)
8. [Modèle de sécurité](#modèle-de-sécurité)
9. [Référencement et partage](#référencement-et-partage)
10. [Modération](#modération)
11. [Favoris et historiques](#favoris-et-historiques)
12. [Performances des annonces](#performances-des-annonces)
13. [Paramètres du compte](#paramètres-du-compte)
14. [Notifications](#notifications)
15. [Thème clair et sombre](#thème-clair-et-sombre)
16. [Application installable (PWA)](#application-installable-pwa)
17. [Performance](#performance)
18. [Tests](#tests)
19. [Identité visuelle](#identité-visuelle)
20. [Docker](#docker)
21. [Scripts](#scripts)
22. [Exploitation](#exploitation)

Le déploiement en production (Coolify, VPS Hostinger, Docker) a son propre
document : [`DEPLOIEMENT.md`](DEPLOIEMENT.md).

---

## Démarrage rapide

Prérequis : **Node.js ≥ 20** et un projet **Supabase** (offre gratuite suffisante).

```bash
npm install
cp .env.example .env.local     # puis renseignez vos clés Supabase
npm run dev                    # http://localhost:3000
```

---

## Configuration Supabase

1. Créez un projet sur [supabase.com](https://supabase.com) (région la plus
   proche de vos utilisateurs, par exemple `eu-west-3`).

2. Appliquez le schéma — cinq migrations, puis les données de référence :

   ```bash
   npx supabase link --project-ref <votre-ref>
   npx supabase db push        # migrations, dans l'ordre
   npx supabase config push    # Auth, Storage et API depuis supabase/config.toml
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

   Ou, depuis le SQL Editor, les fichiers de `supabase/migrations/` dans l'ordre
   de leur préfixe, puis `supabase/seed.sql`. Tous sont **idempotents**.

   👉 Modèle de données, politiques d'accès, configuration Auth/Storage et
   tâches planifiées sont documentés dans
   **[`supabase/README.md`](./supabase/README.md)**.

3. Dans **Project Settings → API**, copiez `Project URL`, la clé `anon` et la
   clé `service_role` vers votre `.env.local`.

4. Dans **Authentication → URL Configuration**, ajoutez votre URL de
   redirection : `https://votre-domaine.ga/auth/callback` (et
   `http://localhost:3000/auth/callback` pour le développement).

5. _(Recommandé)_ Activez l’extension `pg_cron` (Database → Extensions) puis
   rejouez `supabase/migrations/20260801000500_performance.sql` : il planifie
   l’expiration des annonces, les alertes d’échéance, la clôture des abonnements
   et le rafraîchissement des statistiques.

6. Vérifiez le schéma hors ligne, contre un PostgreSQL jetable :

   ```bash
   ./supabase/tests/run.sh
   ```

### Promouvoir un modérateur

Le rôle n’est pas modifiable depuis l’application : la colonne est exclue du
`GRANT UPDATE` (voir [Modèle de sécurité](#modèle-de-sécurité)). Depuis le SQL
Editor :

```sql
update public.users set role = 'moderator' where id = '<uuid-utilisateur>';
```

---

## Variables d’environnement

| Variable                        | Portée           | Obligatoire            | Description                                                                                              |
| ------------------------------- | ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client + serveur | ✅                     | URL du projet Supabase                                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + serveur | ✅                     | Clé publique ; l’autorisation réelle est assurée par la RLS                                              |
| `NEXT_PUBLIC_SITE_URL`          | client + serveur | ✅ (prod)              | URL canonique, sans slash final (SEO, sitemap, redirections auth)                                        |
| `SUPABASE_SERVICE_ROLE_KEY`     | **serveur seul** | ❌ (✅ pour encaisser) | Secret ; contourne la RLS. Requis pour appliquer les rappels d’opérateur                                 |
| `AIRTEL_MONEY_*`                | **serveur seul** | ❌                     | `BASE_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `CALLBACK_SECRET` — sans elles, Airtel Money n’est pas proposé |
| `MOOV_MONEY_*`                  | **serveur seul** | ❌                     | Idem pour Moov Money                                                                                     |
| `ANTHROPIC_API_KEY`             | **serveur seul** | ❌                     | Active « Rédiger pour moi » et la correction orthographique                                              |
| `AI_MODEL`                      | **serveur seul** | ❌                     | Surcharge du modèle (défaut : le modèle rapide)                                                          |
| `NEXT_PUBLIC_MAP_TILE_URL`      | client + serveur | ❌                     | Gabarit de tuiles de la carte (défaut : OpenStreetMap)                                                   |
| `NEXT_PUBLIC_MAP_ATTRIBUTION`   | client + serveur | ❌                     | Mention légale affichée sous la carte                                                                    |

Les variables publiques sont validées au démarrage par `lib/env.ts` : une clé
absente ou malformée fait échouer le build avec un message explicite plutôt
qu’une erreur obscure en production.

> ⚠️ Les variables `NEXT_PUBLIC_*` sont **inlinées dans le bundle client au
> build**. Elles doivent être fournies au moment du `docker build`
> (`--build-arg`), pas seulement au démarrage du conteneur.

---

## Structure du projet

```
daghoip-ikassa/
├── app/                        # App Router : routes, layouts, Server Actions
│   ├── actions/                # Server Actions ('use server') — écritures
│   ├── annonces/               # Recherche, détail, dépôt d'annonce
│   ├── vendeurs/[id]/          # Profil public : annonces, avis, note moyenne
│   ├── auth/callback/          # Retour du flux d'authentification Supabase
│   ├── premium/                # Offres d'abonnement et souscription
│   ├── api/paiements/          # Rappels signés des opérateurs Mobile Money
│   ├── compte/                 # Espace privé (tableau de bord, profil, vérification…)
│   ├── admin/                  # Tableau de bord : statistiques, annonces, catégories,
│   │                           #   signalements, paiements, abonnements, paramètres, audit
│   ├── (legal)/                # Pages légales, gabarit partagé
│   ├── layout.tsx              # Gabarit racine, métadonnées, en-tête/pied
│   ├── sitemap.ts robots.ts manifest.ts
│   └── error.tsx not-found.tsx
├── components/                 # Composants React
│   ├── ui/                     # Primitives (Button, Field, Modal, Badge…)
│   ├── layout/                 # En-tête, pied de page, recherche, menus
│   ├── listings/               # Carte, grille, filtres, formulaire, galerie
│   ├── messages/               # Fil temps réel, composeur, émojis, blocage
│   ├── profile/                # Étoiles, avis, formulaire d'évaluation
│   ├── payments/               # Offres, tunnel de paiement, historique, facture
│   ├── charts/                 # Graphiques SVG maison : tendance, classement, vignette
│   ├── categories/ home/ auth/ account/ common/
├── lib/                        # Infrastructure
│   ├── supabase/               # Clients navigateur / serveur / admin / middleware
│   ├── auth/                   # Gardes de rôle (roles.ts serveur, roles.client.ts isomorphe)
│   ├── payments/               # Abstraction opérateurs (Airtel, Moov, hors ligne)
│   ├── ai/                     # Assistant de rédaction + mise en forme locale
│   ├── env.ts errors.ts logger.ts rate-limit.ts
├── hooks/                      # Hooks client (useUser, useFavorite, filtres…)
├── services/                   # Accès aux données (lecture) — Server Components
├── types/                      # Types applicatifs + miroir du schéma SQL
├── utils/                      # Fonctions pures (format, téléphone, slug, Zod)
├── styles/globals.css          # Design system Tailwind (palette de la marque)
├── public/                     # Logo officiel et fichiers statiques
├── supabase/                   # Migrations, config Auth/Storage, seed, tests
├── Dockerfile docker-compose.yml
└── middleware.ts               # Rafraîchissement de session + routes protégées
```

---

## Architecture

**Lecture / écriture séparées.** Les `services/` ne font que lire (appelés
depuis des Server Components) ; les écritures passent par des Server Actions
dans `app/actions/`, qui revalident tout avec Zod.

Deux exceptions assumées, où le navigateur appelle directement une RPC
PostgreSQL : **l’envoi d’un message** et **l’accusé de lecture**. Un
aller-retour supplémentaire par le serveur Next.js n’y apporterait aucune
garantie — la RLS et les triggers s’appliquent de la même façon — et ne ferait
que retarder l’affichage de son propre message dans une messagerie temps réel.
Le contrôle réel vit en base : le trigger d’insertion refuse un message vers un
compte bloqué ou une pièce jointe qui n’appartient pas à son expéditeur.

**Photos.** Les fichiers sont envoyés **du navigateur vers Supabase Storage**,
sans transiter par le serveur Next.js. La Server Action ne reçoit que les
chemins, qu’elle vérifie avant enregistrement. Convention :
`<user_id>/<listing_id>/<uuid>.<ext>`.

**Recherche.** Une colonne `tsvector` pondérée (titre > ville > description) est
maintenue par trigger et indexée en GIN. Les accents sont retirés des deux côtés
(`unaccent` en base, `normalize('NFD')` côté requête) pour que « telephone »
trouve « téléphone ».

**URLs.** Une annonce vit à l’adresse `/annonces/<slug>-<REFERENCE>` : le slug
est lisible et modifiable sans casser le lien, la référence à 8 caractères
(alphabet sans `I`, `O`, `0`, `1`) reste l’identifiant stable.

**Page d’une annonce.** `/annonces/<slug>-<REF>` réunit la galerie photo (plein
écran, balayage tactile, navigation au clavier), le prix, la description
repliable, la carte de repérage, l’encart vendeur, les boutons d’appel,
WhatsApp, messagerie interne, favoris, partage et signalement, puis les annonces
similaires. Sur mobile, l’ordre du document place le bloc de contact **avant**
la description : le bouton d’appel ne se mérite pas au terme d’un long
défilement. À partir de `lg`, ce bloc devient une colonne latérale collante.

**Carte de repérage.** Pas de bibliothèque cartographique : `utils/map.ts`
projette la position en tuiles Web Mercator et `ListingMap` en dispose une
grille — quelques centaines d’octets là où Leaflet ou MapLibre pèseraient plus
que le reste de la page. La carte affiche un **disque d’incertitude** plutôt
qu’une épingle, parce que la base n’enregistre la position qu’à ~110 m près :
prétendre mieux serait mentir sur la donnée.

**Recherche instantanée.** `/annonces` est rendue **deux fois, à deux moments
différents**, et c’est délibéré :

1. le serveur produit la première page de résultats — c’est ce qu’indexe un
   moteur de recherche, et ce que voit un visiteur dont le JavaScript n’est pas
   encore chargé ;
2. `SearchExperience` reprend ces résultats et interroge ensuite PostgreSQL
   **directement depuis le navigateur** (RPC `search_ads`, toujours sous RLS).
   Chaque changement de filtre coûte alors un aller-retour réseau au lieu de
   deux — sur une connexion mobile gabonaise, c’est la latence qui pèse, pas le
   calcul.

Les deux chemins partagent le même code (`services/ads.search.ts`) : une seule
définition des filtres, une seule RPC.

Trois précautions dans un champ qui se met à jour à la frappe : le texte est
temporisé (300 ms) alors que les autres filtres s’appliquent immédiatement ;
les requêtes devenues obsolètes sont annulées et un compteur de génération
écarte les réponses arrivées dans le désordre ; l’URL est mise à jour par
`history.replaceState`, donc sans navigation ni rendu serveur.

**Profil utilisateur.** `/vendeurs/<id>` a **deux visages sans être deux
pages** : tout le monde y voit la photo, le nom, la ville, la description, la
note moyenne, les avis et l’historique des annonces ; le propriétaire y voit en
plus son téléphone, ses favoris et le bouton de modification.

Ce n’est pas un choix d’affichage mais une conséquence du schéma :
`users.phone` est hors du `GRANT SELECT` public et `favorites` est protégée par
une RLS « propriétaire uniquement ». Un visiteur ne les obtiendrait pas même en
interrogeant l’API directement — l’interface ne fait que refléter ce que la
base autorise.

Les avis y trouvent enfin leur place : `can_review()` exige un échange réel par
la messagerie avant d’autoriser une évaluation, et l’évalué dispose d’un droit
de réponse, limité par le `GRANT UPDATE` aux seules colonnes `reply` et
`replied_at`.

**Tableau de bord d’administration.** `/admin` réunit les statistiques et
graphiques, la modération des annonces, la gestion des catégories, les
signalements, les vérifications, les paiements, les abonnements, les paramètres
et le journal d’audit.

Les **graphiques sont dessinés en SVG, sans bibliothèque** — Recharts ou
Chart.js pèseraient plus que toutes les pages d’administration réunies pour un
usage qui se résume à une mise à l’échelle et à un tracé. Trois règles s’y
appliquent :

- **une série par graphique.** Comptes, annonces, messages et recettes n’ont pas
  les mêmes ordres de grandeur ; les superposer imposerait deux axes verticaux —
  la faute la plus courante en visualisation. Quatre petits graphiques
  indépendants disent la même chose sans mentir sur les proportions ;
- **une seule teinte par graphique**, celle de la marque (l’or pour l’argent).
  La couleur n’y code aucune identité : elle ne distingue rien, donc pas de
  légende à décoder ;
- **un tableau de repli sous chaque courbe**, qui restitue la série entière —
  lisible au lecteur d’écran, exploitable au copier-coller.

Les indicateurs viennent de trois fonctions `SECURITY DEFINER` qui vérifient
`is_staff()` en première ligne et ne renvoient **que des nombres** : le volume
de messages échangés, jamais leur contenu.

**Messagerie temps réel.** `messages`, `conversations` et `notifications` sont
diffusées par Supabase Realtime, RLS comprise : un abonné ne reçoit que les
lignes qu’il pourrait lire. Le fil affiche les messages entrants et les accusés
de lecture sans rechargement, et l’envoi est **optimiste** — le message apparaît
immédiatement, puis la ligne réelle le remplace à son retour.

Elle couvre les photos (bucket privé, URL signées), un sélecteur d’émojis
maison, les accusés de lecture posés seulement quand la fenêtre est réellement
visible, le blocage d’un correspondant, l’archivage et la recherche dans les
conversations. Les comptes bloqués se gèrent depuis `/compte/blocages`.

**État de la recherche.** Les filtres vivent dans l’URL
(`?q=&categorie=&ville=&quartier=&prix_min=&depuis=&tri=…`) : la recherche
reste partageable et indexable. **Une seule exception : la position GPS du
filtre « autour de moi »**, qui ne quitte jamais le navigateur — elle n’est ni
enregistrée, ni ajoutée au lien de la page.

**Dépôt d’annonce.** Le formulaire (`components/listings/ListingForm.tsx`)
couvre titre, description, prix, catégorie, ville, quartier, photos multiples,
téléphone, WhatsApp, position GPS, état, durée de publication et mise en avant.
Trois principes :

- **Un seul schéma de validation.** `utils/validation.ts` sert à la fois au
  retour immédiat dans le navigateur (`hooks/useLiveValidation.ts`) et à la
  revalidation dans la Server Action. Un champ n’affiche son erreur qu’une fois
  quitté, et un indicateur « Validation automatique » résume ce qu’il reste à
  corriger.
- **Rien de sensible n’est décidé par le client.** La durée de publication est
  rebornée à 7–90 jours en base, la position GPS y est arrondie à ~110 m, le
  tarif d’une mise en avant est relu dans `ad_feature_plans` — le formulaire
  n’envoie qu’un code d’offre. Un contenu manifestement interdit bascule
  l’annonce en `pending_review` plutôt que d’être refusé automatiquement.
- **La saisie survit à la connexion.** `hooks/useDraft.ts` enregistre un
  brouillon dans `localStorage` (jamais envoyé au serveur, photos exclues) et
  propose de le reprendre au retour.

---

## Paiements

**Le montant ne vient jamais du navigateur.** Le client n’envoie qu’un _code
d’offre_ ; `request_subscription()` et `request_ad_feature()` relisent le tarif
dans `subscription_plans` / `ad_feature_plans`, les seules tables qui font foi.
Falsifier le prix affiché ne change rien au paiement créé.

**Seul le serveur constate un encaissement.** `apply_payment_callback()` — la
seule fonction capable de faire passer un paiement à `succeeded` — n’est
accordée qu’à `service_role`. Un compte authentifié qui l’appelle est refusé par
PostgreSQL, pas par une garde applicative.

### Le parcours

1. le payeur choisit une offre et un moyen de paiement (`/premium`, ou
   « Mettre en avant » depuis ses annonces) ;
2. un paiement `pending` est créé en base, avec sa référence `DI-PAY-…` ;
3. l’adaptateur de l’opérateur engage la demande — le téléphone du payeur sonne ;
4. l’opérateur rappelle `/api/paiements/<operateur>/callback` ; la signature du
   corps brut est vérifiée, le rappel est **consigné avant d’être appliqué** ;
5. le passage à `succeeded` attribue le numéro de facture, active l’abonnement
   ou la mise en avant, et notifie le payeur.

Le rappel est idempotent : les opérateurs rejouent leurs envois, et un rejeu ne
crédite pas deux fois. Un statut final ne revient jamais en arrière.

### Brancher Airtel Money ou Moov Money

L’abstraction tient dans `lib/payments/types.ts` : ajouter un opérateur consiste
à écrire un module qui implémente `PaymentProviderAdapter` et à l’inscrire dans
`lib/payments/registry.ts`. Aucune page, aucune action et aucun objet SQL n’a à
changer.

> ⚠️ Les adaptateurs Airtel et Moov sont **complets dans leur forme mais non
> éprouvés contre les API réelles** : ils ont été écrits d’après la forme
> publique de ces passerelles, sans contrat marchand ni accès bac à sable. La
> marche à suivre avant mise en service est détaillée dans
> [`supabase/README.md`](supabase/README.md#brancher-un-opérateur-mobile-money).

Tant que les variables `AIRTEL_MONEY_*` / `MOOV_MONEY_*` sont vides, l’opérateur
n’est **pas proposé** au payeur et sa route de rappel répond 404. La plateforme
reste utilisable : le règlement se fait par virement ou en espèces, confirmé
depuis `/admin/paiements` par un administrateur — opération tracée avec son
identité dans `payment_events`.

### Factures

Numérotation par exercice et sans trou (`DI-FAC-2026-000042`), attribuée à la
confirmation du paiement seulement. La facture est consultable et imprimable
depuis `/compte/factures/<id>` ; `get_invoice()` est `security invoker`, donc
c’est la RLS de `payments` qui décide qui la voit.

---

## Aides intelligentes

Six fonctionnalités, deux natures très différentes — et la distinction est le
cœur de la conception.

**Quatre sont calculées, pas générées.** Suggestion de prix, détection de
doublons, signaux de fraude et recommandations vivent en base
([`supabase/migrations/20260801001200_ai_features.sql`](supabase/migrations/20260801001200_ai_features.sql)).
Ce sont des questions statistiques et relationnelles : un modèle de langage y
serait plus lent, plus cher, non déterministe et impossible à auditer. La
médiane d’un prix se calcule, elle ne s’invente pas. Ces quatre fonctions
marchent sans aucune clé et sans aucun appel réseau.

**Deux demandent un modèle.** Rédiger une description et corriger l’orthographe
supposent une compréhension de la langue qu’aucune règle SQL n’apporte. Elles
vivent dans `lib/ai/` et sont **facultatives** : sans `ANTHROPIC_API_KEY`, les
boutons correspondants ne sont pas affichés et le dépôt d’annonce reste
entièrement utilisable.

Entre les deux, `lib/ai/tidy.ts` traite localement ce qui relève de la mise en
forme — capitales criées, ponctuation répétée, espacement français, séparateurs
de milliers. C’est gratuit, instantané, et cela couvre en pratique l’essentiel
de ce qui rend une annonce pénible à lire.

### Ce qu’elles ne font pas

Aucune ne décide à la place de quelqu’un :

- le **score de fraude** ordonne une file de lecture pour la modération
  (`/admin/fraude`). Il ne masque, ne refuse et ne signale aucune annonce. Un
  score de règles se trompe — un vendeur pressé peut brader, un commerçant peut
  mentionner son WhatsApp par habitude — et faire porter la décision à la
  machine ferait payer ces erreurs à des gens réels, sans recours ;
- la **détection de doublons** prévient, elle ne fusionne pas ;
- la **suggestion de prix** affiche ce que demandent les autres vendeurs, avec
  le nombre d’annonces sur lequel elle repose, et ne préremplit jamais le champ ;
- les **suggestions de rédaction** s’affichent à côté du texte du vendeur, avec
  « Remplacer » et « Garder mon texte ». Rien n’est écrit sans son geste.

### Injection d’invite

Le titre et les notes d’une annonce sont du contenu non fiable. Les consignes
sont placées dans le `system`, le contenu du vendeur est délimité et présenté
comme une donnée à décrire, et la sortie est rebornée puis renettoyée avant
d’être proposée. Le pire cas reste une suggestion inadaptée, que le vendeur voit
avant de l’accepter.

---

## Modèle de sécurité

La défense repose sur **quatre couches indépendantes** :

### 1. Row Level Security (source de vérité)

RLS activée sur toutes les tables. L’application n’utilise que la clé anonyme :
même une requête forgée depuis la console du navigateur ne peut pas dépasser ce
que les politiques autorisent.

### 2. Privilèges de colonnes

Certaines colonnes ne sont tout simplement pas accordées au rôle
`authenticated` :

- `users.phone` / `users.whatsapp` / `users.district` — hors du `grant select`
  public : les coordonnées d’un utilisateur ne sont pas lisibles par les autres.
  Le propriétaire récupère sa fiche complète via `public.get_my_profile()`
  (`SECURITY DEFINER`).
- `users.role` / `users.status` / `users.is_verified` — hors du `grant update` :
  **aucune auto-promotion possible**, y compris par requête forgée.
- `ads.is_featured`, `views_count`, `favorites_count`, `contacts_count` — hors
  du `grant update` ; posés par trigger ou à la confirmation d’un paiement.
- `payments` et `notifications` — aucun droit d’écriture client : seuls
  `service_role` et les fonctions `SECURITY DEFINER` y écrivent.

Ces protections sont couvertes par la suite de tests (`./supabase/tests/run.sh`,
556 assertions), qui rejoue notamment des tentatives d’auto-promotion
administrateur, de falsification de compteurs, de lecture du téléphone d’autrui,
d’auto-attribution du badge vérifié, d’écriture dans le journal d’audit, de mise
en avant d’une annonce sans paiement, de contournement d’un blocage par
insertion directe, d’auto-déclaration de paiement par le payeur, de
confirmation d’un règlement par un modérateur et de lecture des signaux de
fraude par un compte ordinaire.

### 3. Validation serveur (Zod)

Chaque Server Action revalide intégralement ses entrées avec les schémas de
`utils/validation.ts`. Le formulaire client ne sert qu’au confort d’usage.

### 4. Authentification

Quatre méthodes de connexion : e-mail + mot de passe, Google, Facebook, et code
SMS. Toutes convergent vers une session Supabase, et le trigger
`handle_new_user` crée le profil quel que soit le fournisseur.

- **Rôles** : `user` < `moderator` < `admin`. `role` et `status` sont hors du
  `GRANT UPDATE` — seules les RPC `admin_*`, qui revérifient `is_admin()` /
  `is_staff()`, peuvent les écrire. Un administrateur ne peut ni se rétrograder
  lui-même ni retirer le dernier administrateur.
- **Badge vérifié** : posé uniquement par `review_verification()` après contrôle
  des pièces par un modérateur. `is_verified` n'est pas modifiable par
  l'utilisateur : le badge ne peut pas être auto-attribué.
- **Journal d'audit** : `auth_audit_log` est en lecture seule pour tous ; seules
  les fonctions `SECURITY DEFINER` y écrivent.
- **Numéros en E.164** : `+241` suivi du numéro national **sans** le zéro
  d'acheminement, sinon les passerelles SMS rejettent l'envoi. Même logique en
  SQL (`to_e164_gabon`) et en TypeScript (`utils/phone.ts`).
- **Avatars OAuth non repris** : les URL Google/Facebook sont bloquées par la CSP
  et divulgueraient la navigation des utilisateurs au fournisseur.

### 5. Application

- **Rate limiting** sur le dépôt d’annonce, l’envoi de message, le signalement,
  l’authentification, l’ouverture d’un paiement et les rappels d’opérateur
  (`lib/rate-limit.ts`).
- **En-têtes de sécurité** : CSP restrictive (`connect-src` limité à Supabase,
  `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Permissions-Policy` — voir `next.config.ts`.
- **Carte de repérage, compromis assumé** : `img-src` autorise en plus l'hôte de
  tuiles, dérivé de `NEXT_PUBLIC_MAP_TILE_URL`. Charger ces images révèle au
  fournisseur l'adresse IP du visiteur ; `referrerPolicy="no-referrer"` lui
  épargne au moins l'URL de l'annonce consultée. Aucun script tiers n'est
  chargé — seulement des images. Pour supprimer toute dépendance externe,
  pointez la variable vers un serveur de tuiles que vous hébergez : la CSP suit
  automatiquement. Une annonce sans coordonnées n'appelle de toute façon aucune
  tuile — elle affiche le repli « ville et quartier ».
- **Erreurs opaques** : aucun message PostgreSQL brut n’atteint le navigateur
  (`lib/errors.ts`) ; le détail est journalisé côté serveur.
- **Pas d’énumération de comptes** : connexion et réinitialisation renvoient une
  réponse identique que le compte existe ou non.
- **Pas de redirection ouverte** : les paramètres `next` sont validés comme
  chemins internes (`/…`, jamais `//…`).
- **Session validée côté serveur** : `getUser()` (qui vérifie le JWT auprès de
  Supabase) est utilisé partout, jamais `getSession()` seul.
- **Description en texte brut** : le contenu utilisateur n’est jamais rendu en
  HTML, ce qui ferme la porte au XSS stocké.
- **`server-only`** : les modules serveur (dont le client `service_role`) font
  échouer le build s’ils sont importés depuis un composant client.
- **Anti-spam** : le numéro de téléphone d’une annonce n’est pas présent dans le
  HTML initial ; il n’est révélé qu’après un clic explicite.

---

## Référencement et partage

### Ce qui a été mesuré, pas supposé

Deux défauts silencieux ont été trouvés en interrogeant réellement les URL
plutôt qu'en lisant le code :

1. **`/sitemap.xml` renvoyait 404.** Next.js sert `/sitemap/0.xml`,
   `/sitemap/1.xml`… quand on découpe le plan, mais **ne produit aucun index**
   qui les référence — alors que `robots.txt` pointe vers `/sitemap.xml`. Le
   build affichait pourtant « 3 sitemaps générés ». Google y aurait trouvé une
   page d'erreur et le plan entier serait resté lettre morte. Un index est
   désormais servi par `app/sitemap.xml/route.ts`.
2. **Le numéro de fichier arrive en chaîne**, pas en nombre : la comparaison
   stricte `id === 0` échouait, et le fichier des pages fixes partait chercher
   des annonces sur une plage négative. Visible dans le journal de build
   (`page: -1`), invisible autrement.

### Images de partage

Au Gabon, une annonce se partage sur WhatsApp. L'aperçu qui s'affiche dans la
conversation **est** l'annonce, pour celui qui la reçoit. Un logo carré y
tenait lieu d'illustration : autant envoyer une enveloppe vide.

`opengraph-image.tsx` compose désormais une carte 1200×630 par page — photo,
titre, prix, ville, badge « vendeur vérifié ». Trois variantes : le site,
l'annonce, la fiche vendeur.

> Les métadonnées ne déclarent plus d'`images` : une déclaration explicite
> l'emporterait sur la carte générée et ferait gagner la photo brute, souvent
> carrée et rognée dans les fils de discussion — sans le prix, qui est ce qui
> décide du clic.

Limite mesurée et assumée : dans le moteur de rendu de `next/og`, une `<img>`
qui remplit son conteneur remplace le fond de celui-ci au lieu de s'y composer,
et `background-image` avec une URL distante n'est pas rendue. Une photo à fond
transparent apparaîtra donc sur fond clair chez le destinataire. Le cas est
rare — les photos viennent d'appareils photo — et l'aperçu reste lisible.

### Plan du site

| Fichier           | Contenu                                     |
| ----------------- | ------------------------------------------- |
| `/sitemap.xml`    | index qui référence les suivants            |
| `/sitemap/0.xml`  | pages fixes, catégories, **villes**         |
| `/sitemap/1.xml`… | annonces publiées, 20 000 par fichier       |
| suivants          | profils vendeurs ayant au moins une annonce |

Les pages par ville sont nouvelles : « voiture Port-Gentil » est exactement ce
qui se tape dans Google au Gabon, et seule la page nationale pouvait y répondre.
Les profils vendeurs l'étaient aussi — un commerçant qui publie régulièrement a
une page qui mérite d'être trouvée sur son nom.

Le plan est construit avec un client Supabase **anonyme** : il ne liste que du
public, la RLS s'applique donc pleinement et aucune clé secrète n'est requise au
build.

### robots.txt

`/admin/` manquait à la liste d'exclusion. Chaque page d'administration
parcourue est une annonce qui ne l'est pas — le budget d'exploration n'est pas
extensible. À noter : `robots.txt` est public et n'a jamais protégé quoi que ce
soit ; ce qui protège l'administration, c'est `requireRole()` et la RLS.

### Données structurées

`Organization` + `WebSite` + `SearchAction` sur l'accueil, `Product` +
`BreadcrumbList` sur une annonce. Les canoniques des pages filtrées pointent
vers la page de catégorie : des milliers d'URL pour un même inventaire diluent
le signal au lieu de le concentrer.

---

## Modération

Trois niveaux, du plus ouvert au plus restreint.

**Signaler** — une annonce depuis sa page, **un compte** depuis sa fiche
vendeur. Les motifs diffèrent : « mauvaise catégorie » n'a aucun sens pour une
personne, « harcèlement » n'en a aucun pour une annonce. Une même personne ne
signale qu'une fois la même cible, et ne peut pas se signaler elle-même.

**Trier** — `/admin/signalements` regroupe les dossiers **par cible** et les
ordonne par nombre de **signaleurs distincts**. C'est la seule mesure qui
résiste à quelqu'un qui signalerait en boucle : huit personnes sans lien entre
elles qui désignent le même compte, c'est un dossier ; huit signalements d'une
même personne, non.

**Sanctionner** — suspendre ou bannir depuis la file, en un geste qui retire les
annonces de la vitrine, clôt tous les signalements visant le compte et inscrit
la décision au journal d'audit. Un modérateur ne peut sanctionner ni lui-même,
ni un membre de l'équipe.

### Rien n'est automatique

Aucun compte n'est bloqué par un compteur de signalements. Un mécanisme qui
bannirait au bout de N signalements offrirait à tout groupe coordonné le moyen
de faire taire un concurrent. Un signalement ouvre un dossier, une personne
tranche.

Le détail — déduplication, dossier de compte, protections — est dans
[`supabase/README.md`](supabase/README.md#modération).

---

## Favoris et historiques

**Favoris** — bascule optimiste : le cœur change d'état immédiatement, puis se
resynchronise sur la réponse du serveur et revient en arrière en cas d'échec.
La bascule elle-même est atomique côté PostgreSQL (`toggle_favorite`), ce qui
évite le doublon qu'un double clic produirait avec un `insert`/`delete` séparés.
Un visiteur non connecté est redirigé vers la connexion, avec retour à la page
d'origine.

**Historiques** — recherches récentes et annonces consultées, sur
`/compte/historique`.

|                              | Connecté                             | Anonyme        |
| ---------------------------- | ------------------------------------ | -------------- |
| Où                           | tables `search_history` / `ad_views` | `localStorage` |
| Suit d'un appareil à l'autre | oui                                  | non            |
| Trace côté serveur           | oui, effaçable, purgée à 90 jours    | **aucune**     |

La majorité des visites d'une plateforme d'annonces se font sans compte :
réserver la fonctionnalité aux personnes connectées reviendrait à en priver la
plupart des gens. Le stockage local comble ce vide et n'expose rien — mais il
ne suit pas d'un appareil à l'autre, ce qui est le bon compromis pour quelqu'un
qui n'a de toute façon rien à synchroniser.

Ces historiques sont **strictement privés** : la RLS n'accorde aucune exception
au personnel, contrairement à toutes les autres tables. Le détail — plafonds,
purge, séparation d'avec le compteur public de vues — est dans
[`supabase/README.md`](supabase/README.md#historiques-personnels).

---

## Performances des annonces

Quatre chiffres par annonce — **vues**, **favoris**, **contacts**, **messages** —
sur `/compte/annonces/<id>/statistiques`, plus une synthèse en tête de
`/compte/annonces`.

Le chiffre qui compte est le **taux de contact**, pas le nombre de vues. Mille
vues sans un seul appel n'est pas un succès : c'est un prix mal placé ou une
photo qui n'inspire pas confiance, et c'est cela qu'un vendeur peut corriger.
La page l'affiche en grand, avec une phrase qui dit quoi en faire — et se tait
sous une trentaine de vues, parce qu'un taux calculé sur cinq visites ne
signifie rien.

Un contact est enregistré au **clic** : afficher le numéro, ouvrir WhatsApp,
envoyer un premier message. Pas à l'affichage de la page — une annonce très vue
et jamais contactée est précisément le signal à ne pas noyer.

### Mesurer sans pister

Compter finement suppose de reconnaître un visiteur, et reconnaître un visiteur
suppose de le pister. Nous avons tranché dans l'autre sens :

|                         | Ce qui est conservé                          |
| ----------------------- | -------------------------------------------- |
| Identité du visiteur    | **aucune** — ni compte, ni session, ni IP    |
| Clé de dédoublonnage    | empreinte SHA-256 de `visiteur:annonce:jour` |
| Durée de vie de la clé  | 7 jours                                      |
| Historique quotidien    | 1 an, agrégé, sans lien avec personne        |
| Accès aux tables brutes | fermé à tous, **vendeur compris**            |

Un test interroge `information_schema` pour vérifier qu'aucune colonne
d'identité n'existe dans `ad_contacts` : une colonne ajoutée par mégarde ferait
échouer la suite. Le vendeur apprend donc _combien_ de personnes l'ont contacté
et _par quel canal_, jamais _qui_.

Côté navigateur, `useVisitorId` tire un identifiant au hasard pour les visiteurs
non connectés. Sans lui, tous les anonymes se confondraient en un seul et un
vendeur ne verrait jamais qu'un contact par jour. Il ne contient rien de la
personne, ne va que vers notre serveur, et n'y est jamais stocké en clair.

Le détail — dédoublonnage, séries sans trou, médiane plutôt que moyenne pour la
comparaison de catégorie, purge — est dans
[`supabase/README.md`](supabase/README.md#performances-des-annonces).

---

## Paramètres du compte

Quatre réglages, réunis sur `/compte/parametres`.

### Mot de passe — l'ancien est désormais exigé

Le changement se faisait sans le demander. Une session égarée — téléphone
prêté, poste partagé resté ouvert, cookie dérobé — suffisait alors à changer le
mot de passe, donc à verrouiller la personne **hors de son propre compte**.
C'est le scénario le plus courant, et de loin le plus coûteux pour la victime.

Le mot de passe actuel est vérifié par un client Supabase **jetable** : le
faire sur le client habituel écraserait les cookies de session, et une faute de
frappe déconnecterait la personne pour la peine. Deux cas s'en dispensent, et
ils sont légitimes :

| Cas                                    | Pourquoi                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Retour du lien « mot de passe oublié » | La personne ne le connaît précisément pas. Elle a prouvé autrement qu'elle relève les courriels du compte. |
| Compte Google, Facebook ou SMS         | Il n'y a pas d'ancien mot de passe. Exiger l'impossible empêcherait d'en définir un premier.               |

Le premier cas repose sur un marqueur `httpOnly` posé par `/auth/callback`
**après** un échange de code réussi — le forger suppose de détenir déjà le lien
reçu par courriel. Il dure dix minutes et se consomme à la première
utilisation.

Un changement réussi **révoque les autres sessions** (`scope: 'others'`). Si
l'on change de mot de passe parce qu'on se croit compromis, laisser l'intrus
connecté ailleurs viderait l'opération de son sens. La session courante, elle,
est conservée.

### Langue

Français par défaut — c'est la langue des affaires au Gabon — et anglais. Le
choix vit dans un cookie **et** dans `users.language` : le cookie sert aux
visiteurs sans compte, qui sont la majorité, la colonne fait suivre la
préférence d'un appareil à l'autre.

Le catalogue est un objet TypeScript typé, pas un JSON chargé à l'exécution ni
une bibliothèque : `tsc` refuse alors de compiler s'il manque une clé en
anglais — l'erreur la plus banale d'une traduction, et celle qui se voit le
plus en production. Zéro dépendance ajoutée, rien à télécharger.

`<html lang>` suit la langue rendue. Ce n'est pas cosmétique : un lecteur
d'écran choisit sa voix d'après cet attribut, et un texte anglais annoncé avec
les règles du français est à peu près inécoutable.

> **Ce qui est traduit** : navigation, espace personnel, paramètres, et le
> chrome partagé. **Ce qui ne l'est pas, et ne le sera pas** : les annonces et
> les messages. Traduire automatiquement une annonce, c'est en changer le sens
> sans que son auteur puisse le vérifier — un prix « à débattre » devenu ferme,
> un « bon état » devenu « comme neuf ». Sur une plateforme où l'on s'engage sur
> ce qui est écrit, c'est un risque qu'on ne prend pas. Le reste de l'interface
> suit progressivement.

### Suppression du compte

Anonymisation irréversible, pas un `delete`. La base l'interdit et elle a
raison : `payments.user_id` est en `on delete restrict`, et un effacement
viderait les fils de discussion **des autres** comme il changerait la note
d'autres vendeurs. Ce qui part, ce qui reste et pourquoi : le détail est dans
[`supabase/README.md`](supabase/README.md#paramètres-du-compte).

L'écran dit ce qui disparaît **et ce qui est conservé** avant de demander quoi
que ce soit — beaucoup croient que leurs messages s'effacent des conversations
de leurs acheteurs, et il vaut mieux l'apprendre là que le découvrir après. La
confirmation demande de recopier un mot : une case à cocher se coche par
réflexe.

---

## Notifications

Trois canaux, un seul entonnoir : tout passe par `create_notification()`, qui
écrit en base, diffuse en temps réel et met un e-mail en file si les préférences
du destinataire l'autorisent.

| Canal                        | Réglable           | Remarque                                                                                                                  |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Cloche dans l'application    | non                | Elle attend, elle ne dérange pas. La désactiver ferait manquer des réponses.                                              |
| Alerte système du navigateur | oui, par appareil  | Demandée au clic, affichée seulement onglet caché, **titre uniquement** — le corps s'afficherait sur un écran verrouillé. |
| E-mail                       | oui, par catégorie | Réglages sur `/compte/notifications`.                                                                                     |

### Le différé qui évite le courriel de trop

Un e-mail de nouveau message n'est pas expédié tout de suite : il attend dix
minutes (réglable) et **s'annule** si le destinataire a lu le message
entre-temps. Une rafale dans la même conversation ne fait qu'un seul e-mail.
C'est ce qui distingue une notification utile d'une notification qu'on finit
par désactiver.

### Sans fournisseur d'e-mail

Rien ne casse : les notifications restent dans la cloche, la file s'accumule
sans dommage, et l'interface dit à l'utilisateur que l'envoi n'est pas activé
plutôt que de lui promettre un e-mail qui n'arrivera jamais.

Le détail du mécanisme — file d'envoi, travailleur, alertes ajoutées — est dans
[`supabase/README.md`](supabase/README.md#notifications).

---

## Thème clair et sombre

Trois états : **clair**, **sombre**, **système** (défaut). Le troisième compte —
un interrupteur à deux positions ne permet pas de dire « suis mon téléphone »,
qui est pourtant le bon réglage pour la plupart des gens.

### Comment c'est fait

Tailwind 4 compile chaque utilitaire de couleur en `var(--color-…)`. Redéfinir
ces variables sous `[data-theme='dark']` bascule donc toute l'interface, sans
toucher aux ~900 classes de couleur du projet — et sans que le prochain
composant écrit puisse « oublier » de gérer le mode sombre.

Deux règles gouvernent les valeurs :

- **l'échelle neutre s'inverse**, en conservant le sens de chaque palier :
  `text-neutral-800` reste « le texte principal », `bg-neutral-100` reste « un
  fond légèrement contrasté » ;
- **le vert de marque ne s'inverse pas au milieu**. `bg-brand-700` reste le vert
  profond de l'en-tête et des boutons : c'est l'identité visuelle, elle ne change
  pas selon l'heure. Seuls permutent les paliers _de texte_ (800, 900) et _de
  fond teinté_ (50–200), qui dépendent du fond sur lequel ils se posent.

Trois jetons sémantiques rendent cela possible :

| Jeton               | Rôle                    | Pourquoi il existe                                                                                                                     |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-card`      | fond des cartes         | `text-white` doit rester blanc (il s'écrit sur le vert), `bg-white` doit s'assombrir. Les confondre rendait le mode sombre impossible. |
| `--color-brand-ink` | vert profond de surface | Constant dans les deux thèmes : porte le pied de page et le survol des boutons primaires, où le texte est blanc.                       |
| `--color-field`     | bordure des champs      | La WCAG demande 3:1 pour la limite d'un composant ; `neutral-300` sur blanc plafonne à 1,5:1.                                          |

### Pas de clignotement

Un script synchrone de six lignes pose `data-theme` dans le `<head>`, avant la
première peinture. Sans lui, la page s'afficherait en clair puis basculerait —
un éclair blanc en pleine nuit, exactement ce que le mode sombre évite.

### Vérification

Le contraste n'est pas estimé, il est **mesuré dans le navigateur** : les
couleurs sont normalisées par un canvas (seul moyen fiable de lire `oklch()` et
de composer les alphas), puis comparées paire par paire. Les deux thèmes passent
WCAG AA sur l'ensemble des textes rendus.

---

## Application installable (PWA)

Manifeste, service worker et page hors ligne. Sur mobile, le navigateur propose
« Ajouter à l'écran d'accueil » ; l'icône ouvre l'application en plein écran,
avec trois raccourcis (déposer une annonce, messages, mes annonces).

### Ce qui est mis en cache — et ce qui ne l'est pas

Les pages HTML ne sont **jamais** mises en cache. C'est une décision de
sécurité, pas une limite technique : au Gabon, un téléphone est souvent partagé
entre plusieurs personnes d'un même foyer ou d'un même commerce. Une page
« Mes messages » servie depuis le cache après une déconnexion montrerait la
conversation de quelqu'un d'autre. Le risque ne vaut pas la seconde gagnée.

| Ressource                               | Stratégie                                       |
| --------------------------------------- | ----------------------------------------------- |
| `/_next/static/*` (nom haché, immuable) | cache d'abord                                   |
| Images d'annonces                       | périmé pendant revalidation, 60 entrées max     |
| Page hors ligne, logo                   | préchargés à l'installation                     |
| Navigation HTML                         | réseau seul → page hors ligne en cas de coupure |
| API, authentification, requêtes non-GET | jamais interceptées                             |

---

## Performance

- **Images** : AVIF puis WebP, largeurs calées sur les `sizes` réellement
  demandées, un an de cache navigateur. `dangerouslyAllowSVG` reste à `false` —
  une image distante ne doit jamais pouvoir devenir un vecteur de script.
- **Cache HTTP** : `immutable` sur les fichiers hachés ; `no-store` sur `/sw.js`,
  car un service worker périmé continuerait de servir d'anciennes stratégies et
  deviendrait impossible à corriger à distance.
- **Bundle** : `optimizePackageImports` sur `lucide-react` et `date-fns` —
  importer trois icônes ne doit pas tirer les mille autres.
- **Polices** : pile système, aucun appel réseau. Sur une connexion mobile
  gabonaise, une police téléchargée coûte plus qu'elle ne rapporte.
  Le référencement a sa propre section :
  [Référencement et partage](#référencement-et-partage).

---

## Tests

Deux suites, exécutables hors ligne, sans service tiers :

```bash
npm test           # 66 tests unitaires (Node natif, zéro dépendance ajoutée)
npm run test:sql   # 556 assertions sur un PostgreSQL jetable
npm run verify     # typage + lint + tests + build
```

Les tests unitaires tournent avec `node --test` et le mode de retrait des types
de Node 22 : pas de coureur de tests à installer, à configurer ni à maintenir.
Un crochet de résolution (`tests/alias-hooks.mjs`) fait comprendre l'alias `@/`
à Node, pour que les tests importent les modules **exactement** comme le fait le
code de production.

Ils couvrent le nettoyage typographique, la normalisation des numéros gabonais,
les slugs et références d'annonces, la préférence de thème, la vérification de
signature des rappels d'opérateur et la composition des e-mails de notification.

---

## Identité visuelle

Le logo officiel est `public/logo-daghoip-ikassa.png`, exposé par le composant
`components/common/Logo.tsx` (variantes `full` / `mark`, mode `inverted` pour
les fonds verts).

| Couleur         | Hex       | Jeton Tailwind      | Usage principal                     |
| --------------- | --------- | ------------------- | ----------------------------------- |
| Vert principal  | `#095032` | `brand-700`         | En-tête, boutons primaires, titres  |
| Vert secondaire | `#216548` | `brand-500`         | Survols, dégradés, accents          |
| Doré premium    | `#C89F4A` | `gold-500`          | CTA « Déposer une annonce », badges |
| Blanc           | `#FCFCFC` | `ivory` / `surface` | Fond des surfaces                   |

Les deux teintes de marque sont déclinées en échelles 50→900 dans
`styles/globals.css` (bloc `@theme`), source de vérité du design system.

---

## Docker

```bash
cp .env.example .env      # renseignez vos clés
docker compose up --build
```

Ou sans Compose :

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://daghoip-ikassa.ga \
  -t daghoip-ikassa:latest .

docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  daghoip-ikassa:latest
```

L’image de production utilise la sortie `standalone` de Next.js, s’exécute sous
un utilisateur non privilégié (`nextjs`, uid 1001), avec système de fichiers en
lecture seule, `no-new-privileges` et une sonde de santé HTTP.

### En production : tirer plutôt que construire

`docker-compose.prod.yml` **tire** l’image publiée par GitHub Actions au lieu de
la construire sur place :

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Ce n’est pas un détail de confort. Construire Next.js demande environ 2 Go de
mémoire ; un VPS d’entrée de gamme en a 1 ou 2. La construction y échoue — ou,
plus pénible, y réussit en déclenchant le tueur de mémoire du noyau au milieu
d’un déploiement, laissant le service à l’arrêt.

### Déploiement automatique

`.github/workflows/deploiement.yml` : à chaque poussée sur `main`, la CI est
rejouée **en entier**, l’image est publiée sur GHCR (`latest` et le SHA du
commit), puis Coolify est prévenu. L’étiquette par SHA est ce qui rend un retour
en arrière possible — avec `latest` seul, la version précédente n’a plus de nom.

Le workflow réutilise `ci.yml` par `workflow_call` plutôt que d’en recopier les
étapes : dupliquer les contrôles les aurait fatalement laissés diverger, et
c’est toujours la copie du déploiement qui s’allège.

> ⚠️ **Une image = un environnement.** Les `NEXT_PUBLIC_*` sont inlinées au
> build : l’image publiée est liée à un projet Supabase et à un domaine précis.
> Deux environnements demandent deux constructions.

Le détail — réglages GitHub, Coolify, VPS Hostinger, retour arrière — est dans
[`DEPLOIEMENT.md`](DEPLOIEMENT.md).

---

## Scripts

| Commande             | Effet                                                  |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Serveur de développement                               |
| `npm run build`      | Build de production (`standalone`)                     |
| `npm start`          | Sert le build de production                            |
| `npm run typecheck`  | Vérification TypeScript sans émission                  |
| `npm run lint`       | ESLint (config Next.js + TypeScript)                   |
| `npm run format`     | Prettier (+ tri des classes Tailwind)                  |
| `npm test`           | Tests unitaires (Node natif)                           |
| `npm run test:sql`   | Suites SQL sur un PostgreSQL jetable                   |
| `npm run verify`     | Typage + lint + tests + build                          |
| `npm run verify:env` | Contrôle de configuration (`-- --prod` pour la prod)   |
| `npm run check:map`  | Contrôles de la projection cartographique (Node 22.6+) |

---

## Exploitation

**Expiration des annonces.** Une annonce publiée expire après 60 jours
(`LISTING_LIMITS.publicationDays`, aligné sur le trigger SQL). La bascule est
faite par `public.expire_listings()`, à planifier avec `pg_cron`.

**Rate limiting multi-instances.** `lib/rate-limit.ts` est un compteur en
mémoire, suffisant pour une instance unique. Derrière plusieurs répliques,
remplacez l’implémentation par un store partagé (Redis / Upstash) en conservant
la signature de `checkRateLimit` — aucun appelant n’a besoin d’être modifié.

**Modération.** Les signalements arrivent dans `public.reports` et ne sont
lisibles que par les comptes `moderator` / `admin`. Une interface de modération
n’est pas incluse : le tri se fait pour l’instant depuis le tableau de bord
Supabase.

**Types de base de données.** Après toute modification du schéma :

```bash
npx supabase gen types typescript --project-id <ref> --schema public > types/database.ts
```

---

## Licence

Projet propriétaire — Daghoip Ikassa.
