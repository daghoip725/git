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
│   ├── …000700_ad_form_features.sql          # Expiration, GPS, revue auto, mise en avant
│   ├── …000800_search_filters.sql            # Quartier, ancienneté, rayon géographique
│   ├── …000900_messaging.sql                 # Blocage, photos, recherche, temps réel
│   └── …001000_admin_stats.sql               # Indicateurs, séries, répartitions
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
8. `migrations/20260801000800_search_filters.sql`
9. `migrations/20260801000900_messaging.sql`
10. `migrations/20260801001000_admin_stats.sql`
11. `migrations/20260801001100_payments.sql`
12. `migrations/20260801001200_ai_features.sql`
11. `seed.sql`

Tous les fichiers sont **idempotents** : les rejouer ne casse rien.

> `…000500_performance.sql` planifie des tâches `pg_cron`. Si l'extension n'est
> pas encore activée (Database → Extensions → `pg_cron`), le fichier affiche un
> avertissement et poursuit ; rejouez-le après activation.

## Modèle de données

Onze entités métier, plus six tables de support (`ad_images`,
`subscription_plans`, `ad_feature_plans`, `verification_requests`,
`auth_audit_log`, `blocked_users`) — dix-sept au total.

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

RLS activée sur **les 17 tables**, 49 politiques. L'application n'utilise que la
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
definer` réservé à cinq cas légitimes, avec `search_path` figé :

1. lecture du rôle (`current_user_role`) — sinon récursion de politique ;
2. écriture destinée à **autrui** (`create_notification`) ;
3. maintenance planifiée (`expire_ads`, `purge_old_notifications`, …) ;
4. **agrégats de supervision** (`admin_kpis`, `admin_daily_stats`,
   `admin_ad_distribution`) — compter les messages échangés suppose de
   traverser une table dont la RLS est nominative, ce qu'aucun modérateur ne
   peut ni ne doit pouvoir faire ligne à ligne. Ces trois fonctions vérifient
   `is_staff()` **en première ligne** et ne renvoient que des nombres : jamais
   une ligne, jamais un extrait, jamais un identifiant ;
5. **encaissement** (`request_subscription`, `apply_payment_callback`,
   `admin_confirm_payment`, `next_invoice_number`) — le tarif doit être relu
   dans une table que le client ne doit pas pouvoir écrire, et le passage à
   `succeeded` doit rester hors de portée du navigateur. Chacune vérifie son
   appelant en première ligne : session pour l'ouverture, `service_role` pour le
   rappel d'opérateur (privilège d'exécution), `is_admin()` pour la confirmation
   manuelle.

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

## Recherche

`search_ads()` est le point d'entrée unique : texte, catégorie, ville,
quartier, prix, état, type de prix, ancienneté et rayon géographique, avec tri
et pagination — le tout en **une seule requête**, `total_count` compris (fonction
fenêtre). La même RPC sert le rendu serveur et la recherche instantanée du
navigateur.

**Distance sans PostGIS.** Une recherche « autour de moi » se traite très bien
avec un pré-filtre par rectangle englobant — servi par l'index partiel
`ads_geo_idx` — suivi d'une distance de haversine sur le petit reliquat.
Installer une extension géospatiale complète pour cela compliquerait le
déploiement sans rien apporter à cette échelle. Le rayon est borné à 200 km :
au-delà, le rectangle couvrirait le pays entier et l'index ne servirait plus.

**Quartiers.** Le champ est libre : « Nzeng-Ayong », « nzeng ayong » et
« NZENG AYONG » désignent le même endroit. `normalize_label()` les ramène à
une forme comparable (minuscules, sans accents, ponctuation réduite à une
espace) ; l'index `ads_district_idx` porte sur cette même expression, sans quoi
il ne serait jamais utilisé. `list_districts()` recense les quartiers
réellement présents et restitue l'orthographe la plus fréquente — il n'existe
pas de référentiel des quartiers du Gabon, et en inventer un serait faux.

## Messagerie

Le modèle existant (fils, compteurs de non-lus dénormalisés, accusés de lecture,
notifications par trigger) est complété par quatre mécanismes.

**Blocage.** `blocked_users` est **unilatéral et discret** : la RLS ne laisse
lire à chacun que ses propres blocages, et `is_blocked_between()` — SECURITY
DEFINER par nécessité — ne répond que par oui ou non, jamais « qui a bloqué
qui ». Le refus est appliqué par un **trigger** sur `messages`, pas seulement
dans `send_message()` : la RLS autorise aussi l'insertion directe, et un blocage
contournable en appelant l'API n'en serait pas un. Le message d'erreur est
volontairement identique dans les deux sens.

**Photos.** Un message peut ne porter qu'une pièce jointe ; la contrainte est
passée de « au moins un caractère » à « du texte OU une pièce jointe ». Le même
trigger vérifie que le chemin respecte `<expéditeur>/<conversation>/<fichier>` —
en plus de la politique Storage, qui l'exige déjà.

**Recherche.** `search_conversations()` interroge simultanément le contenu des
messages (colonne `tsvector` **générée**, donc impossible à désynchroniser), le
titre de l'annonce et le nom du correspondant : chercher « Toyota » doit
retrouver le fil sur la Toyota même si le mot n'est dans aucun message.

**Temps réel.** `messages`, `conversations` et `notifications` sont inscrites à
la publication `supabase_realtime`. La RLS s'applique aussi à la diffusion : un
abonné ne reçoit que les lignes qu'il aurait le droit de lire. `messages` passe
en `replica identity full` pour que les événements UPDATE — les accusés de
lecture — portent la ligne entière et non la seule clé.

## Tests

La suite couvre 333 assertions réparties en huit fichiers : schéma et sécurité
générale (`01`), authentification, rôles et vérification vendeur (`02`),
formulaire d'annonce (`03`), recherche et filtres (`04`), messagerie (`05`),
statistiques d'administration (`06`), paiements et facturation (`07`), aides
intelligentes (`08`). Elle vérifie le cycle de vie des annonces, la
recherche, les favoris, la messagerie, les avis, les quotas, les paiements, les
signalements, la maintenance, les cascades, les filtres et tris de recherche, le
blocage, les pièces jointes, l'archivage et les agrégats d'administration — et
une batterie de tentatives d'attaque (auto-promotion administrateur, falsification de compteurs, lecture du
téléphone d'autrui, injection de notification, création de paiement, insertion
dans le fil d'un tiers, mise en avant de l'annonce d'autrui, auto-mise en avant
sans paiement, contournement d'un blocage par insertion directe, pièce jointe
déposée au nom d'autrui, lecture des conversations d'un tiers, lecture des
statistiques par un compte ordinaire, injection dans le paramètre de
dimension, tentative du payeur de se déclarer payé, appel direct de
`apply_payment_callback` depuis un compte authentifié, rappel à signature
invalide, rejeu d'un rappel déjà appliqué, retour en arrière depuis un statut
final, confirmation manuelle par un modérateur ou par le payeur lui-même).

```bash
./supabase/tests/run.sh
```

Le script démarre un PostgreSQL jetable, y rejoue toutes les migrations, puis la
suite de tests. `tests/00_supabase_shim.sql` reproduit le strict minimum de
l'environnement Supabase (rôles, `auth.uid()`, `storage.objects`) pour que tout
tourne **hors ligne**, sans projet distant.

## Aides intelligentes

Quatre des six fonctionnalités demandées sont **calculées en base**, sans modèle
de langage : ce sont des questions statistiques et relationnelles, et un modèle
y serait plus lent, plus cher, non déterministe et impossible à auditer.

| Fonction | Où | Principe |
| --- | --- | --- |
| `suggest_price` | SQL | Médiane et quartiles des comparables sur 365 jours. Trois périmètres (ville → province → national) ; celui retenu est renvoyé. Zéro ligne sous 5 comparables. |
| `find_duplicate_ads` | SQL | Similarité trigramme sur le titre, même catégorie. Distingue le doublon du même vendeur du recopiage par un tiers. |
| `ad_fraud_signals` / `flagged_ads` | SQL | Score de règles pondérées, avec justification par signal. Personnel seulement. |
| `recommend_ads` | SQL | Recommandation par le contenu, déduite des favoris. Repli sur les annonces populaires. |
| Rédaction, correction | `lib/ai/` | Modèle de langage, facultatif. |

### Ce que ces fonctions ne font pas

Aucune ne décide. Le score de fraude **ordonne une file de lecture** ; il ne
masque, ne refuse et ne signale rien — même politique que `needs_manual_review`,
et pour la même raison : un faux positif ne doit jamais pénaliser un vendeur
honnête. La détection de doublons ne fusionne rien : deux Toyota Corolla 2010 à
Libreville peuvent légitimement porter le même titre. La suggestion de prix ne
préremplit pas le champ : proposer un prix, ce serait le fixer.

### Poids des signaux de fraude

Choisis pour qu'**aucun signal isolé n'atteigne le seuil de revue** (50) : c'est
la conjonction qui alerte, pas l'indice unique.

| Signal | Poids |
| --- | --- |
| `contenu_interdit` | 60 |
| `prix_aberrant` (moins de 35 % de la médiane) | 35 |
| `paiement_anticipe` | 30 |
| `compte_neuf_prolifique` | 25 |
| `contact_hors_plateforme` | 20 |
| `republication_en_serie` | 15 |
| `sans_photo` | 10 |

Un vendeur nouveau n'est pas suspect ; un vendeur nouveau qui brade un article
et renvoie vers WhatsApp en exigeant un acompte, si.

## Exploitation

### Promouvoir un modérateur

Impossible depuis l'application (`role` hors du `GRANT UPDATE`). Depuis le SQL
Editor :

```sql
update public.users set role = 'moderator' where id = '<uuid>';
```

### Encaisser un paiement

Le parcours normal ne passe **pas** par le SQL Editor : l'application ouvre le
paiement (`request_subscription()` / `request_ad_feature()`, qui relisent le
tarif au catalogue) et la route `/api/paiements/<operateur>/callback` applique le
rappel signé de l'opérateur via `apply_payment_callback()`, avec la clé
`service_role`. Cette fonction est idempotente : un rappel rejoué ne crédite pas
deux fois, et un statut final ne revient jamais en arrière.

Pour un règlement **hors ligne** (virement, espèces, dépôt Mobile Money fait à la
main), la confirmation se fait depuis `/admin/paiements` par un administrateur.
Elle attribue le numéro de facture, active la prestation et laisse une trace
nominative dans `payment_events`.

En dernier recours, depuis le SQL Editor :

```sql
select * from public.apply_payment_callback(
  'DI-PAY-XXXXXXXX',      -- référence du paiement
  'airtel_money',
  '<txn-operateur>',
  'succeeded'
);
```

### Facturation

Les numéros sont attribués par exercice et **sans trou**
(`DI-FAC-2026-000042`), au moment où le paiement aboutit — jamais avant. Le
compteur `invoice_counters` est verrouillé le temps de la transaction : une
séquence PostgreSQL laisserait des trous au moindre `rollback`, ce qu'une
numérotation de factures ne tolère pas.

### Brancher un opérateur Mobile Money

Les adaptateurs Airtel Money et Moov Money (`lib/payments/providers/`) sont
complets dans leur forme mais **n'ont pas été éprouvés contre les API réelles** :
ils ont été écrits d'après la forme publique de ces passerelles, sans contrat
marchand ni accès bac à sable. Avant toute mise en service :

1. confronter chemins et noms de champs à la documentation contractuelle ;
2. vérifier le schéma de signature des rappels (HMAC-SHA256 du corps brut ici,
   mais certains contrats utilisent RSA ou une liste blanche d'IP) ;
3. confirmer le format du numéro attendu ;
4. rejouer un encaissement complet en bac à sable, rappel compris.

Tant que les variables `AIRTEL_MONEY_*` / `MOOV_MONEY_*` ne sont pas renseignées,
l'opérateur n'apparaît pas dans la liste des moyens de paiement et sa route de
rappel répond 404 : aucun payeur ne peut tomber sur une intégration non validée.

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
