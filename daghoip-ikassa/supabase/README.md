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
│   ├── …000500_performance.sql               # Vues, autovacuum, stats, pg_cron
│   ├── …000600_auth_roles_verification.sql   # E.164, vérification vendeur, rôles, audit
│   └── …000700_ad_form_features.sql          # Expiration, GPS, revue auto, mise en avant
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
6. `migrations/20260801000600_auth_roles_verification.sql`
7. `migrations/20260801000700_ad_form_features.sql`
8. `seed.sql`

Tous les fichiers sont **idempotents** : les rejouer ne casse rien.

> `…000500_performance.sql` planifie des tâches `pg_cron`. Si l'extension n'est
> pas encore activée (Database → Extensions → `pg_cron`), le fichier affiche un
> avertissement et poursuit ; rejouez-le après activation.

## Modèle de données

Onze entités métier, plus cinq tables de support (`ad_images`,
`subscription_plans`, `ad_feature_plans`, `verification_requests`,
`auth_audit_log`) — seize au total.

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

RLS activée sur **les 16 tables**, 45 politiques. L'application n'utilise que la
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

Quatre chemins d'entrée aboutissent tous à une session Supabase, et le trigger
`handle_new_user` crée le profil `public.users` correspondant quel que soit le
fournisseur.

| Méthode               | État             | Prérequis                 |
| --------------------- | ---------------- | ------------------------- |
| E-mail + mot de passe | Opérationnel     | Aucun                     |
| Google                | Câblé, à activer | Identifiants OAuth        |
| Facebook              | Câblé, à activer | Identifiants OAuth        |
| Téléphone (OTP SMS)   | Câblé, à activer | Fournisseur SMS (Twilio…) |

### Réglages (`config.toml`, section `[auth]`)

- confirmation d'e-mail **obligatoire** ;
- changement d'adresse à double confirmation (ancienne + nouvelle) ;
- mot de passe : 8 caractères minimum, minuscule + majuscule + chiffre ;
- vérification contre la base HaveIBeenPwned ;
- rotation des jetons de rafraîchissement, JWT valide 1 heure ;
- liste blanche stricte des URL de redirection (anti-redirection ouverte) ;
- limitation de débit sur e-mails, connexions et OTP ;
- e-mails aux couleurs de la marque (`templates/`).

### Format des numéros — E.164

Le zéro national d'acheminement **n'existe pas** en E.164 : une passerelle SMS
rejette `+2410612345 6`. `public.to_e164_gabon()` normalise donc :

```
saisie « 06 12 34 56 »    →  +2416123456
saisie « 074 12 34 56 »   →  +24174123456
saisie « 00241 6123456 »  →  +2416123456
```

`utils/phone.ts` applique exactement la même logique côté client, pour que les
deux couches normalisent à l'identique. Le plan gabonais compte 7 à 9 chiffres
significatifs : la contrainte les accepte tous.

Un index unique partiel garantit qu'un numéro n'est rattaché qu'à un seul
compte. Si un numéro est déjà pris, l'inscription aboutit quand même — sans le
téléphone — plutôt que d'échouer.

### Fournisseurs externes

Les identifiants OAuth se créent dans la Google Cloud Console et sur Meta for
Developers, avec pour URL de redirection autorisée :

```
https://<votre-ref>.supabase.co/auth/v1/callback
```

Supabase relie automatiquement une identité OAuth à un compte e-mail existant
lorsque l'adresse est identique et vérifiée par le fournisseur : un utilisateur
ne se retrouve donc pas avec deux comptes.

> L'avatar fourni par Google ou Facebook n'est **volontairement pas repris** :
> c'est une URL sur un domaine tiers, que la CSP bloque et qui signalerait au
> fournisseur chaque consultation de page. L'utilisateur téléverse son avatar
> dans le bucket `avatars`.

### Connexion par SMS

Au Gabon le téléphone est le premier identifiant : le premier envoi de code crée
le compte, les suivants connectent. Il n'y a donc pas d'écran d'inscription
distinct pour cette méthode.

Le SMS a un coût réel : trois limites se cumulent — par IP (envoi), par numéro
(anti-« bombardement » d'un tiers) et sur la vérification (anti-devinage du code
à 6 chiffres). Sans fournisseur SMS configuré, l'envoi échoue proprement et
l'interface renvoie vers la connexion par e-mail.

## Rôles et modération

Trois rôles hiérarchisés : `user` < `moderator` < `admin`.

| Action                         | Utilisateur | Modérateur | Administrateur |
| ------------------------------ | :---------: | :--------: | :------------: |
| Publier, échanger, évaluer     |     oui     |    oui     |      oui       |
| Traiter les signalements       |             |    oui     |      oui       |
| Instruire les vérifications    |             |    oui     |      oui       |
| Suspendre un compte ordinaire  |             |    oui     |      oui       |
| Agir sur un membre de l'équipe |             |            |      oui       |
| Changer un rôle                |             |            |      oui       |

`role` et `status` sont **hors du `GRANT UPDATE`** : les RPC `admin_set_user_role`
et `admin_set_user_status` sont le seul chemin d'écriture, et elles revérifient
`is_admin()` / `is_staff()`. Deux garde-fous empêchent le verrouillage : un
administrateur ne modifie pas son propre rôle, et le dernier administrateur ne
peut pas être rétrogradé.

Toute action sensible est consignée dans `auth_audit_log`, table en lecture seule
pour tous : seules les fonctions `SECURITY DEFINER` y écrivent.

### Créer le premier administrateur

Aucun compte n'est administrateur au départ. Depuis le SQL Editor :

```sql
update public.users set role = 'admin' where id = '<uuid-utilisateur>';
```

## Badge vendeur vérifié

1. Le vendeur dépose ses pièces (CNI, RCCM) dans le bucket **privé**
   `verification-docs` et remplit `/compte/verification`.
2. Un modérateur les consulte via une **URL signée valable 5 minutes** — il
   n'existe pas d'URL publique pour ce bucket.
3. L'approbation pose `users.is_verified`, reprend le nom commercial, notifie le
   vendeur et journalise la décision.

`is_verified` est exclu du `GRANT UPDATE` : le badge ne peut pas être
auto-attribué. Seule `review_verification()` le positionne.

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

## Dépôt d'annonce — règles appliquées en base

Le formulaire propose ; la base dispose. Quatre traitements du trigger
`ads_before_write()` et de la RPC `request_ad_feature()` ne sont **jamais**
contournables depuis le client :

| Règle                     | Comportement                                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Expiration**            | Une durée hors des bornes est ramenée dans l'intervalle 7–90 jours. La date n'est rebornée que si elle change réellement : modifier son annonce ne la reconduit donc pas.                                                                           |
| **Position GPS**          | Latitude et longitude sont arrondies à 3 décimales (~110 m) : le quartier, jamais le domicile. Une coordonnée orpheline est écartée.                                                                                                                |
| **Validation du contenu** | `needs_manual_review()` reconnaît une liste étroite de contenus interdits (ivoire, pangolin, armes, faux papiers, stupéfiants). L'annonce passe en `pending_review` — elle n'est **jamais** refusée automatiquement, et le staff échappe au filtre. |
| **Mise en avant**         | Le formulaire n'envoie qu'un **code d'offre** ; le montant est relu dans `ad_feature_plans`. La mise en avant ne s'applique qu'à la confirmation du paiement, jamais avant.                                                                         |

Les écritures sans `auth.uid()` (`service_role`, maintenance planifiée)
échappent au bornage de l'expiration : c'est ce qui permet au back-office de
corriger une date et à `expire_ads()` d'être testable.

## Tests

La suite couvre 134 assertions réparties en trois fichiers : schéma et sécurité
générale (`01`), authentification, rôles et vérification vendeur (`02`),
formulaire d'annonce (`03`). Elle vérifie le cycle de vie des annonces, la
recherche, les favoris, la messagerie, les avis, les quotas, les paiements, les
signalements, la maintenance, les cascades — et une batterie de tentatives
d'attaque (auto-promotion administrateur, falsification de compteurs, lecture du
téléphone d'autrui, injection de notification, création de paiement, insertion
dans le fil d'un tiers, mise en avant de l'annonce d'autrui, auto-mise en avant
sans paiement).

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
