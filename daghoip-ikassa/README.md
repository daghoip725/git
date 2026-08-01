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

2. Dans **SQL Editor**, exécutez dans cet ordre :

   | Fichier               | Rôle                                                    |
   | --------------------- | ------------------------------------------------------- |
   | `supabase/schema.sql` | Tables, contraintes, triggers, RPC, RLS, bucket Storage |
   | `supabase/seed.sql`   | Catégories et sous-catégories de référence              |

   Les deux scripts sont **idempotents** : ils peuvent être rejoués sans risque.

3. Dans **Project Settings → API**, copiez `Project URL`, la clé `anon` et la
   clé `service_role` vers votre `.env.local`.

4. Dans **Authentication → URL Configuration**, ajoutez votre URL de
   redirection : `https://votre-domaine.ga/auth/callback` (et
   `http://localhost:3000/auth/callback` pour le développement).

5. _(Optionnel mais recommandé)_ Activez l’extension `pg_cron` et planifiez
   l’expiration automatique des annonces :

   ```sql
   select cron.schedule('expire-listings', '0 3 * * *', $$select public.expire_listings()$$);
   ```

### Promouvoir un modérateur

Le rôle n’est pas modifiable depuis l’application (voir
[Modèle de sécurité](#modèle-de-sécurité)). Depuis le SQL Editor :

```sql
update public.profiles set role = 'moderator' where id = '<uuid-utilisateur>';
```

---

## Variables d’environnement

| Variable                        | Portée           | Obligatoire | Description                                                       |
| ------------------------------- | ---------------- | ----------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client + serveur | ✅          | URL du projet Supabase                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + serveur | ✅          | Clé publique ; l’autorisation réelle est assurée par la RLS       |
| `NEXT_PUBLIC_SITE_URL`          | client + serveur | ✅ (prod)   | URL canonique, sans slash final (SEO, sitemap, redirections auth) |
| `SUPABASE_SERVICE_ROLE_KEY`     | **serveur seul** | ❌          | Secret ; contourne la RLS. Réservé aux tâches d’administration    |

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
│   ├── compte/                 # Espace privé (tableau de bord, profil…)
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
│   ├── env.ts errors.ts logger.ts rate-limit.ts
├── hooks/                      # Hooks client (useUser, useFavorite, filtres…)
├── services/                   # Accès aux données (lecture) — Server Components
├── types/                      # Types applicatifs + miroir du schéma SQL
├── utils/                      # Fonctions pures (format, téléphone, slug, Zod)
├── styles/globals.css          # Design system Tailwind (palette de la marque)
├── public/                     # Logo officiel et fichiers statiques
├── supabase/                   # schema.sql + seed.sql
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

**État de la recherche.** Les filtres vivent dans l’URL
(`?q=&categorie=&ville=&prix_min=…`) : la page reste un Server Component, la
recherche est partageable et indexable.

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

- `profiles.phone` / `profiles.whatsapp` — hors du `grant select` public : les
  coordonnées d’un utilisateur ne sont pas lisibles par les autres. Le
  propriétaire récupère sa fiche complète via `public.get_my_profile()`
  (`SECURITY DEFINER`).
- `profiles.role` / `profiles.is_verified` — hors du `grant update` : **aucune
  auto-promotion possible**, y compris par requête forgée.
- `listings.is_featured`, `views_count`, `favorites_count` — hors du
  `grant update`, et re-forcés par le trigger `listings_before_write`.

### 3. Validation serveur (Zod)

Chaque Server Action revalide intégralement ses entrées avec les schémas de
`utils/validation.ts`. Le formulaire client ne sert qu’au confort d’usage.

### 4. Application

- **Rate limiting** sur le dépôt d’annonce, l’envoi de message, le signalement
  et l’authentification (`lib/rate-limit.ts`).
- **En-têtes de sécurité** : CSP restrictive (`connect-src` limité à Supabase,
  `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Permissions-Policy` — voir `next.config.ts`.
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

| Commande            | Effet                                 |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Serveur de développement              |
| `npm run build`     | Build de production (`standalone`)    |
| `npm start`         | Sert le build de production           |
| `npm run typecheck` | Vérification TypeScript sans émission |
| `npm run lint`      | ESLint (config Next.js + TypeScript)  |
| `npm run format`    | Prettier (+ tri des classes Tailwind) |

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
