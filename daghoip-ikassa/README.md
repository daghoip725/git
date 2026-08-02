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
6. [Modèle de sécurité](#modèle-de-sécurité)
7. [Identité visuelle](#identité-visuelle)
8. [Docker](#docker)
9. [Scripts](#scripts)
10. [Exploitation](#exploitation)

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

| Variable                        | Portée           | Obligatoire | Description                                                       |
| ------------------------------- | ---------------- | ----------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client + serveur | ✅          | URL du projet Supabase                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + serveur | ✅          | Clé publique ; l’autorisation réelle est assurée par la RLS       |
| `NEXT_PUBLIC_SITE_URL`          | client + serveur | ✅ (prod)   | URL canonique, sans slash final (SEO, sitemap, redirections auth) |
| `SUPABASE_SERVICE_ROLE_KEY`     | **serveur seul** | ❌          | Secret ; contourne la RLS. Réservé aux tâches d’administration    |
| `NEXT_PUBLIC_MAP_TILE_URL`      | client + serveur | ❌          | Gabarit de tuiles de la carte (défaut : OpenStreetMap)            |
| `NEXT_PUBLIC_MAP_ATTRIBUTION`   | client + serveur | ❌          | Mention légale affichée sous la carte                             |

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
│   ├── auth/callback/          # Retour du flux d'authentification Supabase
│   ├── compte/                 # Espace privé (tableau de bord, profil, vérification…)
│   ├── admin/                  # Modération : signalements, vérifications, rôles, audit
│   ├── (legal)/                # Pages légales, gabarit partagé
│   ├── layout.tsx              # Gabarit racine, métadonnées, en-tête/pied
│   ├── sitemap.ts robots.ts manifest.ts
│   └── error.tsx not-found.tsx
├── components/                 # Composants React
│   ├── ui/                     # Primitives (Button, Field, Modal, Badge…)
│   ├── layout/                 # En-tête, pied de page, recherche, menus
│   ├── listings/               # Carte, grille, filtres, formulaire, galerie
│   ├── categories/ home/ auth/ account/ common/
├── lib/                        # Infrastructure
│   ├── supabase/               # Clients navigateur / serveur / admin / middleware
│   ├── auth/                   # Gardes de rôle (roles.ts serveur, roles.client.ts isomorphe)
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
depuis des Server Components) ; toutes les écritures passent par des Server
Actions dans `app/actions/`. Aucun composant client n’écrit directement en base.

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
- `ads.is_featured`, `views_count`, `favorites_count` — hors du `grant update` ;
  posés par trigger ou à la confirmation d’un paiement.
- `payments` et `notifications` — aucun droit d’écriture client : seuls
  `service_role` et les fonctions `SECURITY DEFINER` y écrivent.

Ces protections sont couvertes par la suite de tests (`./supabase/tests/run.sh`,
177 assertions), qui rejoue notamment des tentatives d’auto-promotion
administrateur, de falsification de compteurs, de lecture du téléphone d’autrui,
d’auto-attribution du badge vérifié, d’écriture dans le journal d’audit et de
mise en avant d’une annonce sans paiement.

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

- **Rate limiting** sur le dépôt d’annonce, l’envoi de message, le signalement
  et l’authentification (`lib/rate-limit.ts`).
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

---

## Scripts

| Commande            | Effet                                                  |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Serveur de développement                               |
| `npm run build`     | Build de production (`standalone`)                     |
| `npm start`         | Sert le build de production                            |
| `npm run typecheck` | Vérification TypeScript sans émission                  |
| `npm run check:map` | Contrôles de la projection cartographique (Node 22.6+) |
| `npm run lint`      | ESLint (config Next.js + TypeScript)                   |
| `npm run format`    | Prettier (+ tri des classes Tailwind)                  |

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
