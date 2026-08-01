# Configuration Supabase — Daghoip Ikassa

Schéma PostgreSQL, politiques d'accès, authentification et stockage de la
plateforme d'annonces.

## Contenu du dossier

```
supabase/
├── config.toml                    # Configuration CLI : Auth, Storage, API, pooler
├── migrations/
│   ├── …000100_extensions_types_tables.sql   # Extensions, enums, 13 tables, index
│   ├── …000200_functions_triggers.sql        # 30 fonctions, 18 triggers, RPC
│   ├── …000300_rls_policies.sql              # RLS + privilèges de colonnes
│   ├── …000400_storage.sql                   # 4 buckets + politiques + nettoyage
│   └── …000500_performance.sql               # Vues, autovacuum, stats, pg_cron
├── seed.sql                       # Offres d'abonnement + 32 catégories
├── templates/                     # E-mails d'authentification (charte graphique)
└── tests/                         # Suite de tests fonctionnels et de sécurité
```

## Installation

### Avec la CLI Supabase (recommandé)

```bash
npx supabase link --project-ref <votre-ref>
npx supabase db push        # applique les migrations, dans l'ordre
npx supabase config push    # applique auth / storage / api depuis config.toml
psql "$DATABASE_URL" -f supabase/seed.sql
```

### Depuis le tableau de bord

Dans **SQL Editor**, exécutez les fichiers **dans cet ordre exact** :

1. `migrations/20260801000100_extensions_types_tables.sql`
2. `migrations/20260801000200_functions_triggers.sql`
3. `migrations/20260801000300_rls_policies.sql`
4. `migrations/20260801000400_storage.sql`
5. `migrations/20260801000500_performance.sql`
6. `seed.sql`

Tous les fichiers sont **idempotents** : les rejouer ne casse rien.

> `…000500_performance.sql` planifie des tâches `pg_cron`. Si l'extension n'est
> pas encore activée (Database → Extensions → `pg_cron`), le fichier affiche un
> avertissement et poursuit ; rejouez-le après activation.

## Modèle de données

Onze entités métier, plus deux tables de support (`ad_images`,
`subscription_plans`).

```
auth.users (Supabase)
    │ 1:1
    ▼
  users ──────────┬──────────────┬─────────────┬──────────────┐
    │             │              │             │              │
    │ 1:N         │ 1:N          │ 1:N         │ 1:N          │ 1:N
    ▼             ▼              ▼             ▼              ▼
   ads       favorites    notifications    reviews      subscriptions
    │  ▲          ▲                          (2 FK :         │
    │  └──────────┘                       auteur/évalué)     │ 1:N
    │ 1:N                                                     ▼
    ├──► ad_images                                        payments
    │                                                    (aussi → ads)
    │ 1:N
    ▼
conversations ──1:N──► messages
    (ad_id, buyer_id, seller_id)     reports ──► ads | users | messages | reviews

categories ──1:N──► ads          subscription_plans ──1:N──► subscriptions
    └──auto-référence (parent_id)
```

### Points de conception

| Choix                                                        | Raison                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `users` a la même PK que `auth.users`                        | Pas de table de correspondance ; `auth.users` reste seul détenteur des identifiants de connexion.                                  |
| Fil de discussion dans `conversations`, séparé de `messages` | La liste des conversations se lit sans agrégation : aperçu, date et compteurs de non-lus sont dénormalisés par trigger.            |
| `reports` a quatre cibles possibles                          | Un signalement porte sur une annonce, un compte, un message ou un avis. Une contrainte `CHECK` garantit la cohérence type ↔ cible. |
| `subscription_plans` séparé de `subscriptions`               | Le quota est lu depuis l'offre : changer les limites d'un plan s'applique immédiatement à tous ses abonnés.                        |
| `payments.provider_reference` unique par fournisseur         | Rejouer un webhook Mobile Money ne peut pas créditer deux fois.                                                                    |
| Compteurs dénormalisés (`ads_count`, `favorites_count`, …)   | La page d'accueil et les grilles n'exécutent plus de `COUNT(*)`.                                                                   |

## Sécurité

La défense repose sur **deux mécanismes complémentaires**, plus des contrôles
applicatifs.

### 1. RLS — quelles lignes

RLS activée sur **les 13 tables**, 38 politiques. L'application n'utilise que la
clé anonyme : même une requête forgée depuis la console du navigateur ne peut
pas dépasser ce que les politiques autorisent.

### 2. Privilèges de colonnes — quelles colonnes

C'est la couche qui rend certaines attaques structurellement impossibles :

| Colonne                                             | Traitement                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `users.phone`, `users.whatsapp`, `users.district`   | Hors du `GRANT SELECT` public → illisibles par un tiers. Le propriétaire passe par `get_my_profile()`. |
| `users.role`, `users.status`, `users.is_verified`   | Hors du `GRANT UPDATE` → **aucune auto-promotion possible**.                                           |
| `ads.is_featured`, `views_count`, `favorites_count` | Hors du `GRANT`, posés par trigger ou par paiement.                                                    |
| `payments.*`                                        | Aucun droit d'écriture client : seul `service_role` écrit.                                             |
| `notifications`                                     | Aucun droit d'INSERT client : seule `create_notification()` (SECURITY DEFINER) en crée.                |
| `conversations`                                     | `GRANT UPDATE` limité à `buyer_archived` / `seller_archived`.                                          |

### 3. Règles métier en base

- **Quota d'annonces** : trigger `enforce_ad_quota`, adossé à l'offre. Ne peut
  pas être contourné en appelant l'API directement.
- **Éligibilité d'un avis** : `can_review()` exige une conversation ayant donné
  lieu à un échange réel entre les deux parties.
- **Compte suspendu** : `is_active_account()` bloque toute écriture.

### Convention SECURITY DEFINER

`security invoker` (défaut) partout où la RLS doit s'appliquer. `security
definer` réservé à trois cas légitimes, avec `search_path` figé :

1. lecture du rôle (`current_user_role`) — sinon récursion de politique ;
2. écriture destinée à **autrui** (`create_notification`) ;
3. maintenance planifiée (`expire_ads`, `purge_old_notifications`, …).

## Authentification

Configurée dans `config.toml`, section `[auth]` :

- confirmation d'e-mail **obligatoire** ;
- changement d'adresse à double confirmation (ancienne + nouvelle) ;
- mot de passe : 8 caractères minimum, minuscule + majuscule + chiffre ;
- vérification contre la base HaveIBeenPwned ;
- rotation des jetons de rafraîchissement, JWT valide 1 heure ;
- liste blanche stricte des URL de redirection (anti-redirection ouverte) ;
- limitation de débit sur l'envoi d'e-mails, les connexions et les OTP ;
- e-mails aux couleurs de la marque (`templates/`).

Google et Facebook sont pré-câblés mais **désactivés** : renseignez les
identifiants dans l'environnement puis passez `enabled = true`.

Le SMS est désactivé : la couverture au Gabon suppose un contrat avec un
agrégateur local. Le numéro reste collecté pour le contact entre utilisateurs.

À l'inscription, le trigger `on_auth_user_created` crée automatiquement la ligne
`public.users` correspondante.

## Storage

| Bucket                | Accès  | Limite | Convention de chemin                       |
| --------------------- | ------ | ------ | ------------------------------------------ |
| `ad-images`           | public | 5 Mo   | `<user_id>/<ad_id>/<uuid>.<ext>`           |
| `avatars`             | public | 2 Mo   | `<user_id>/<uuid>.<ext>`                   |
| `message-attachments` | privé  | 5 Mo   | `<user_id>/<conversation_id>/<uuid>.<ext>` |
| `verification-docs`   | privé  | 10 Mo  | `<user_id>/<uuid>.<ext>`                   |

Le **premier segment du chemin est toujours l'identifiant du propriétaire**, et
les politiques le comparent à `auth.uid()` : un utilisateur ne peut ni écraser
ni supprimer les fichiers d'un autre. Les pièces jointes ne sont lisibles que
par les deux participants du fil ; les justificatifs, que par leur auteur et le
staff.

Deux triggers suppriment les objets Storage quand une annonce ou un compte est
supprimé — y compris pour les suppressions faites hors de l'application.

## Performances

- **`search_ads`** : filtres, tri, pagination, image de couverture et total de
  résultats en **une seule requête** (`count(*) over ()`).
- **Index partiels** sur `status = 'published'` : ~90 % des lectures, index
  compact qui tient en cache.
- **GIN** sur `search_vector` (recherche plein texte française, désaccentuée) et
  **trigramme** sur les titres (tolérance aux fautes de frappe).
- **Compteurs dénormalisés** maintenus par trigger.
- **Vues pré-jointes** `ads_list_view` et `conversations_view`
  (`security_invoker = true` : la RLS reste appliquée).
- **Vue matérialisée** `platform_stats`, rafraîchie toutes les 15 minutes.
- **`fillfactor` 85** sur `ads` : favorise les mises à jour HOT des compteurs,
  qui n'ont alors pas à réécrire les index.
- **Statistiques étendues** sur `(city, province)` et `(status, category_id)` :
  colonnes corrélées que le planificateur estimerait mal sans cela.

### Tâches planifiées (pg_cron)

| Tâche                     | Fréquence              |
| ------------------------- | ---------------------- |
| `expire_ads`              | quotidienne, 03h00 UTC |
| `notify_expiring_ads`     | quotidienne, 08h00 UTC |
| `expire_featured_ads`     | horaire                |
| `expire_subscriptions`    | quotidienne, 02h00 UTC |
| `purge_old_notifications` | hebdomadaire           |
| `refresh_platform_stats`  | toutes les 15 minutes  |

## Tests

La suite couvre 45 assertions : cycle de vie des annonces, recherche, favoris,
messagerie, avis, quotas, paiements, signalements, maintenance, cascades — et
une batterie de tentatives d'attaque (auto-promotion administrateur,
falsification de compteurs, lecture du téléphone d'autrui, injection de
notification, création de paiement, insertion dans le fil d'un tiers).

```bash
./supabase/tests/run.sh
```

Le script démarre un PostgreSQL jetable, y rejoue toutes les migrations, puis la
suite de tests. `tests/00_supabase_shim.sql` reproduit le strict minimum de
l'environnement Supabase (rôles, `auth.uid()`, `storage.objects`) pour que tout
tourne **hors ligne**, sans projet distant.

## Exploitation

### Promouvoir un modérateur

Impossible depuis l'application (`role` hors du `GRANT UPDATE`). Depuis le SQL
Editor :

```sql
update public.users set role = 'moderator' where id = '<uuid>';
```

### Enregistrer un paiement Mobile Money

À faire côté serveur avec la clé `service_role`, à réception du callback
opérateur. Le passage à `succeeded` déclenche automatiquement l'activation de
l'abonnement ou la mise en avant de l'annonce, plus la notification.

```sql
insert into public.payments (user_id, purpose, subscription_id, provider,
                             provider_reference, payer_phone, amount, status)
values ('<user>', 'subscription', '<sub>', 'airtel_money',
        '<txn-operateur>', '+241061234567', 15000, 'pending');

update public.payments
   set status = 'succeeded', paid_at = now()
 where provider = 'airtel_money' and provider_reference = '<txn-operateur>';
```

### Régénérer les types TypeScript

```bash
npx supabase gen types typescript --project-id <ref> --schema public > types/database.ts
```

### Diagnostic

```sql
-- Index jamais utilisés
select relname, indexrelname, idx_scan
  from pg_stat_user_indexes
 where schemaname = 'public' and idx_scan = 0;

-- Plan réel d'une recherche
explain (analyze, buffers)
select * from public.search_ads('voiture', 'vehicules', 'Libreville');
```
