# Guide d'installation

De rien à une application qui tourne sur votre machine.

Ce guide suppose que vous n'avez encore rien : ni projet Supabase, ni clés, ni
Node installé. Comptez une demi-heure la première fois, dont la moitié à
attendre que Supabase provisionne la base.

Pour mettre en production, c'est [`DEPLOIEMENT.md`](../DEPLOIEMENT.md).

---

## Sommaire

1. [Ce qu'il vous faut](#ce-quil-vous-faut)
2. [Récupérer le projet](#récupérer-le-projet)
3. [Créer la base Supabase](#créer-la-base-supabase)
4. [Renseigner les variables](#renseigner-les-variables)
5. [Démarrer](#démarrer)
6. [Créer le premier administrateur](#créer-le-premier-administrateur)
7. [Vérifier que tout marche](#vérifier-que-tout-marche)
8. [Les options qu'on peut ajouter plus tard](#les-options-quon-peut-ajouter-plus-tard)
9. [Quand ça ne marche pas](#quand-ça-ne-marche-pas)

---

## Ce qu'il vous faut

| Outil           | Version        | Pourquoi celle-là                                                                                        |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| **Node.js**     | **≥ 22**       | Les tests utilisent le dépouillement de types natif (`--experimental-strip-types`), absent avant la 22.  |
| **npm**         | ≥ 10           | Livré avec Node 22.                                                                                      |
| Compte Supabase | offre gratuite | Suffit largement pour développer, et même pour démarrer en production.                                   |
| PostgreSQL 16   | facultatif     | Uniquement pour lancer les suites SQL hors ligne. Paquet `postgresql-16` **et** `postgresql-contrib-16`. |
| Docker          | facultatif     | Uniquement pour construire l'image.                                                                      |

Vérifiez Node avant tout le reste — c'est la source de mésaventure la plus
fréquente :

```bash
node --version    # doit afficher v22.x ou plus
```

Si vous êtes sur une version antérieure, `npm run dev` fonctionnera quand même,
mais `npm test` échouera sur un message obscur (`bad option:
--experimental-strip-types`). Installez Node 22 avec
[nvm](https://github.com/nvm-sh/nvm) : `nvm install 22 && nvm use 22`.

---

## Récupérer le projet

```bash
git clone <url-du-dépôt> daghoip-ikassa
cd daghoip-ikassa
npm install
```

`npm install` tire environ 500 Mo de dépendances de développement. Sur une
connexion lente, c'est le moment de faire autre chose.

---

## Créer la base Supabase

L'application **ne démarre pas sans base** : toute l'autorisation vit dans
PostgreSQL, il n'y a pas de mode dégradé.

### 1. Le projet

Sur [supabase.com](https://supabase.com), créez un projet. Choisissez la région
la plus proche de vos utilisateurs — `eu-west-3` (Paris) est le meilleur
compromis pour le Gabon parmi les régions proposées.

Notez le mot de passe de la base : Supabase ne le réaffiche jamais.

### 2. Le schéma

Dix-sept migrations, puis les données de référence. Deux façons.

**Avec la CLI** (recommandé — l'ordre est garanti) :

```bash
npx supabase link --project-ref <votre-ref>
npx supabase db push
npx supabase config push
psql "$DATABASE_URL" -f supabase/seed.sql
```

**Depuis le tableau de bord**, si vous préférez voir passer chaque fichier :
SQL Editor, puis les fichiers de `supabase/migrations/` **dans l'ordre de leur
préfixe numérique**, et enfin `supabase/seed.sql`.

> L'ordre n'est pas négociable : la migration 03 pose les politiques d'accès sur
> des tables créées par la 01. Tous les fichiers sont **idempotents** — les
> rejouer ne casse rien, ce qui rend une reprise après erreur sans danger.

La liste complète et le détail de chaque fichier sont dans
[`supabase/README.md`](../supabase/README.md).

### 3. `pg_cron` (recommandé)

Database → Extensions → activez `pg_cron`, puis **rejouez** les migrations qui
planifient des tâches. Sans cette extension, les migrations affichent un
avertissement et poursuivent : rien ne casse, mais les annonces n'expirent
jamais, les statistiques ne se rafraîchissent plus et les historiques ne sont
pas purgés.

Le détail des tâches est dans le
[guide d'administration](ADMINISTRATION.md#tâches-planifiées).

### 4. Les URL de redirection

Authentication → URL Configuration → **Redirect URLs**, ajoutez :

```
http://localhost:3000/auth/callback
```

Sans cette ligne, la confirmation d'inscription par courriel échoue avec une
erreur peu parlante. Ajoutez l'URL de production le jour venu.

---

## Renseigner les variables

```bash
cp .env.example .env.local
```

Trois valeurs suffisent pour démarrer. Elles sont dans **Project Settings →
API** de votre projet Supabase :

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> ⚠️ **Ne confondez pas les deux clés.** Elles se ressemblent, se copient depuis
> le même écran, et l'application démarre parfaitement avec la mauvaise. Mais
> `service_role` **contourne toutes les politiques d'accès** : placée dans
> `NEXT_PUBLIC_SUPABASE_ANON_KEY`, elle part dans le code envoyé au navigateur
> et ouvre votre base entière à n'importe quel visiteur.
>
> Le contrôle ci-dessous attrape exactement cette erreur :

```bash
npm run verify:env
```

Il sépare ce qui bloque de ce qui est simplement absent :

```
  AVERTISSEMENT  ANTHROPIC_API_KEY absente : « Rédiger pour moi » ne sera pas proposée.
  ERREUR         NEXT_PUBLIC_SUPABASE_ANON_KEY contient une clé « service_role ».
```

Un `AVERTISSEMENT` est un choix légitime — vous n'avez pas encore de clé d'IA,
c'est normal. Une `ERREUR` doit être corrigée avant de continuer.

La liste complète des variables, avec leur portée et leur effet, est dans
[`.env.example`](../.env.example) et dans le
[README](../README.md#variables-denvironnement).

---

## Démarrer

```bash
npm run dev
```

<http://localhost:3000>. La page d'accueil doit afficher les 32 catégories
chargées par `seed.sql` — si elle est vide, la base n'a pas reçu les données de
référence.

---

## Créer le premier administrateur

**Aucun administrateur ne peut être créé depuis l'application.** La colonne
`role` est exclue du `GRANT UPDATE`, ce qui rend l'auto-promotion structurellement
impossible — y compris par une requête forgée depuis la console du navigateur.

Il faut donc passer par le SQL Editor, une fois :

```sql
-- 1. Inscrivez-vous normalement sur http://localhost:3000/inscription
-- 2. Retrouvez votre identifiant :
select id, full_name, role from public.users order by created_at desc limit 5;

-- 3. Promouvez-vous :
update public.users set role = 'admin' where id = '<votre-uuid>';
```

Reconnectez-vous : `/admin` est maintenant accessible. La suite est dans le
[guide d'administration](ADMINISTRATION.md).

---

## Vérifier que tout marche

```bash
npm run typecheck    # aucune erreur de type
npm run test:unit    # 77 tests
npm run test:ui      # 29 tests de composants
npm run build        # construction de production
```

Et, si PostgreSQL 16 est installé localement :

```bash
npm run test:sql     # 556 assertions + conformité du typage
```

Cette dernière suite démarre son **propre** serveur PostgreSQL jetable : elle ne
touche ni votre base Supabase, ni une éventuelle base locale. Elle refuse en
revanche de tourner en `root` — `initdb` l'interdit — donc lancez-la depuis un
compte ordinaire.

---

## Les options qu'on peut ajouter plus tard

Rien de ce qui suit n'est nécessaire pour développer. Chaque option absente
**désactive proprement** la fonctionnalité correspondante plutôt que de faire
échouer l'application.

| Option                      | Sans elle                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Connexion Google / Facebook | Les boutons affichent une erreur explicite ; la connexion par courriel reste disponible.             |
| Connexion par SMS           | L'envoi de code échoue ; l'interface bascule sur le courriel.                                        |
| Mobile Money                | Les opérateurs n'apparaissent pas au paiement ; on encaisse par virement, confirmé à la main.        |
| Envoi de courriels          | Les notifications restent dans l'application et la cloche ; seule la copie par courriel manque.      |
| Assistant de rédaction      | « Rédiger pour moi » et « Corriger les fautes » ne sont pas affichés ; le reste du dépôt fonctionne. |

Ce n'est pas un hasard : une plateforme d'annonces doit pouvoir démarrer sans
contrat opérateur ni fournisseur d'envoi.

---

## Quand ça ne marche pas

**« Configuration invalide : variables d'environnement publiques manquantes »**
`.env.local` n'existe pas, ou les deux clés Supabase n'y sont pas. Lancez
`npm run verify:env`, qui nomme précisément ce qui manque.

**La page d'accueil est vide, sans erreur**
`seed.sql` n'a pas été exécuté : il n'y a aucune catégorie. Rejouez-le.

**`npm test` : `bad option: --experimental-strip-types`**
Node est trop ancien. `node --version` doit afficher 22 ou plus.

**L'inscription ne confirme jamais le courriel**
L'URL de redirection n'est pas déclarée côté Supabase (Authentication → URL
Configuration). Le lien reçu renvoie alors vers une adresse rejetée.

**`./supabase/tests/run.sh` : `initdb: cannot be run as root`**
C'est voulu, et c'est PostgreSQL qui le refuse, pas nous. Lancez la suite depuis
un compte ordinaire.

**`npm run test:sql` : `function extensions.digest does not exist`**
`postgresql-contrib-16` n'est pas installé : `pgcrypto` manque.

**Le port 3000 est occupé**
`PORT=3001 npm run dev`. Pensez à ajuster `NEXT_PUBLIC_SITE_URL` **et** l'URL
de redirection Supabase, sinon l'authentification renverra vers le mauvais port.
