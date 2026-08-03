-- =============================================================================
--  Daghoip Ikassa — 01. Extensions, types énumérés, tables et index
-- =============================================================================
--  Migration idempotente : rejouable sans casser une base existante.
--
--  Ordre d'exécution des migrations :
--    20260801000100_extensions_types_tables.sql   (ce fichier)
--    20260801000200_functions_triggers.sql
--    20260801000300_rls_policies.sql
--    20260801000400_storage.sql
--    20260801000500_performance.sql
--  puis seed.sql
--
--  Convention de nommage : tables au pluriel, colonnes en snake_case,
--  clés étrangères suffixées `_id`, index suffixés `_idx`.
-- =============================================================================

create extension if not exists "pgcrypto"  with schema extensions;  -- gen_random_uuid
create extension if not exists "unaccent"  with schema extensions;  -- recherche sans accents
create extension if not exists "pg_trgm"   with schema extensions;  -- recherche approximative
create extension if not exists "btree_gin" with schema extensions;  -- index GIN composites

-- =============================================================================
-- 1. Types énumérés
-- =============================================================================
do $$
begin
  -- --- Comptes ---------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'moderator', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'suspended', 'banned', 'deleted');
  end if;

  -- --- Annonces --------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'ad_status') then
    create type public.ad_status as enum (
      'draft', 'pending_review', 'published', 'sold', 'expired', 'rejected', 'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ad_condition') then
    create type public.ad_condition as enum ('new', 'like_new', 'good', 'fair', 'for_parts');
  end if;

  if not exists (select 1 from pg_type where typname = 'price_type') then
    create type public.price_type as enum ('fixed', 'negotiable', 'free', 'on_request');
  end if;

  -- --- Notifications ---------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'new_message',
      'ad_published',
      'ad_approved',
      'ad_rejected',
      'ad_expiring',
      'ad_expired',
      'ad_sold',
      'new_review',
      'new_favorite',
      'subscription_expiring',
      'payment_succeeded',
      'payment_failed',
      'system'
    );
  end if;

  -- --- Avis ------------------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type public.review_status as enum ('published', 'pending', 'hidden');
  end if;

  -- --- Signalements ----------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'report_target_type') then
    create type public.report_target_type as enum ('ad', 'user', 'message', 'review');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_reason') then
    create type public.report_reason as enum (
      'spam', 'fraud', 'prohibited', 'duplicate', 'wrong_category',
      'offensive', 'harassment', 'fake_profile', 'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
  end if;

  -- --- Paiements -------------------------------------------------------------
  -- Moyens de paiement usuels au Gabon : Airtel Money et Moov Money dominent.
  if not exists (select 1 from pg_type where typname = 'payment_provider') then
    create type public.payment_provider as enum (
      'airtel_money', 'moov_money', 'card', 'bank_transfer', 'cash', 'manual'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_purpose') then
    create type public.payment_purpose as enum (
      'subscription', 'ad_feature', 'ad_boost', 'verification', 'other'
    );
  end if;

  -- --- Abonnements -----------------------------------------------------------
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing', 'active', 'past_due', 'cancelled', 'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'billing_interval') then
    create type public.billing_interval as enum ('monthly', 'quarterly', 'yearly');
  end if;
end
$$;

-- =============================================================================
-- 2. USERS — profil applicatif adossé à auth.users
-- =============================================================================
--  `auth.users` (schéma géré par Supabase) reste la table d'authentification :
--  e-mail, mot de passe chiffré, jetons. `public.users` porte les données
--  métier et est la seule table exposée à PostgREST. La clé primaire est
--  partagée : public.users.id = auth.users.id.
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text unique
                     check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  full_name        text not null check (char_length(full_name) between 2 and 80),
  phone            text check (phone ~ '^\+241[0-9]{9}$'),
  whatsapp         text check (whatsapp ~ '^\+241[0-9]{9}$'),
  city             text check (char_length(city) <= 80),
  province         text check (char_length(province) <= 80),
  district         text check (char_length(district) <= 80),
  avatar_path      text check (char_length(avatar_path) <= 500),
  bio              text check (char_length(bio) <= 500),

  -- Vendeur professionnel
  is_professional  boolean not null default false,
  business_name    text check (char_length(business_name) <= 120),

  -- Attribué par la modération uniquement (jamais par le client)
  is_verified      boolean not null default false,
  role             public.user_role     not null default 'user',
  status           public.account_status not null default 'active',

  -- Compteurs dénormalisés, maintenus par trigger (voir migration 02)
  rating_average   numeric(3, 2) not null default 0
                     check (rating_average >= 0 and rating_average <= 5),
  rating_count     integer not null default 0 check (rating_count >= 0),
  ads_count        integer not null default 0 check (ads_count >= 0),

  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.users is
  'Profil applicatif. Clé primaire partagée avec auth.users. Les colonnes phone/whatsapp ne sont pas lisibles publiquement (privilèges de colonnes, migration 03).';

create index if not exists users_city_idx        on public.users (city);
create index if not exists users_role_idx        on public.users (role) where role <> 'user';
create index if not exists users_professional_idx on public.users (is_professional)
  where is_professional;
-- Recherche de vendeur par nom (autocomplétion) : index trigramme.
create index if not exists users_full_name_trgm_idx
  on public.users using gin (full_name extensions.gin_trgm_ops);

-- =============================================================================
-- 3. CATEGORIES — arborescence sur deux niveaux
-- =============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null check (char_length(name) between 2 and 80),
  icon        text check (char_length(icon) <= 40),
  description text check (char_length(description) <= 300),
  parent_id   uuid references public.categories (id) on delete set null,
  "position"  integer not null default 0,
  is_active   boolean not null default true,
  -- Nombre d'annonces publiées, maintenu par trigger : évite un COUNT(*) par
  -- catégorie sur chaque affichage de la page d'accueil.
  ads_count   integer not null default 0 check (ads_count >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Une catégorie ne peut pas être son propre parent.
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);

create index if not exists categories_parent_idx   on public.categories (parent_id);
create index if not exists categories_position_idx on public.categories ("position")
  where is_active;

-- =============================================================================
-- 4. ADS — les annonces
-- =============================================================================
create table if not exists public.ads (
  id               uuid primary key default gen_random_uuid(),
  -- Référence publique courte, utilisée dans l'URL : /annonces/<slug>-<REF>
  reference        text not null unique,
  seller_id        uuid not null references public.users (id)      on delete cascade,
  category_id      uuid not null references public.categories (id) on delete restrict,

  title            text not null check (char_length(title) between 5 and 120),
  slug             text not null default '',
  description      text not null check (char_length(description) between 20 and 5000),

  price            bigint check (price >= 0 and price <= 5000000000),
  price_type       public.price_type not null default 'fixed',
  currency         text not null default 'XAF' check (currency = 'XAF'),
  condition        public.ad_condition,

  city             text not null check (char_length(city) between 2 and 80),
  province         text check (char_length(province) <= 80),
  district         text check (char_length(district) <= 80),
  latitude         numeric(9, 6)  check (latitude  between -90  and 90),
  longitude        numeric(9, 6)  check (longitude between -180 and 180),

  contact_phone    text check (contact_phone    ~ '^\+241[0-9]{9}$'),
  contact_whatsapp text check (contact_whatsapp ~ '^\+241[0-9]{9}$'),
  allow_messages   boolean not null default true,

  status           public.ad_status not null default 'published',
  is_featured      boolean not null default false,
  featured_until   timestamptz,

  -- Compteurs dénormalisés (triggers) : jamais modifiables par le client.
  views_count      integer not null default 0 check (views_count     >= 0),
  favorites_count  integer not null default 0 check (favorites_count >= 0),
  messages_count   integer not null default 0 check (messages_count  >= 0),

  published_at     timestamptz,
  expires_at       timestamptz,
  sold_at          timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),

  search_vector    tsvector,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Un prix est obligatoire dès que la modalité en suppose un.
  constraint ads_price_required check (
    price_type in ('free', 'on_request') or price is not null
  ),
  -- Une annonce doit exposer au moins un canal de contact.
  constraint ads_contact_required check (
    allow_messages or contact_phone is not null or contact_whatsapp is not null
  ),
  -- Une annonce mise en avant a forcément une échéance.
  constraint ads_featured_needs_deadline check (
    not is_featured or featured_until is not null
  )
);

comment on table public.ads is 'Annonces publiées sur Daghoip Ikassa.';

-- --- Index de lecture ---------------------------------------------------------
-- Index partiels : ~90 % des lectures ne portent que sur les annonces publiées,
-- l'index reste donc petit et tient en cache.
create index if not exists ads_published_recent_idx
  on public.ads (published_at desc) where status = 'published';

create index if not exists ads_category_published_idx
  on public.ads (category_id, published_at desc) where status = 'published';

create index if not exists ads_city_published_idx
  on public.ads (city, published_at desc) where status = 'published';

create index if not exists ads_province_published_idx
  on public.ads (province, published_at desc) where status = 'published';

create index if not exists ads_price_published_idx
  on public.ads (price) where status = 'published' and price is not null;

create index if not exists ads_popular_idx
  on public.ads (views_count desc) where status = 'published';

create index if not exists ads_featured_idx
  on public.ads (featured_until desc) where status = 'published' and is_featured;

-- Tableau de bord vendeur : toutes ses annonces, tous statuts.
create index if not exists ads_seller_idx on public.ads (seller_id, created_at desc);

-- Recherche plein texte pondérée.
create index if not exists ads_search_idx on public.ads using gin (search_vector);

-- Recherche approximative sur le titre (tolérance aux fautes de frappe).
create index if not exists ads_title_trgm_idx
  on public.ads using gin (title extensions.gin_trgm_ops);

-- Balayage des tâches planifiées (expiration).
create index if not exists ads_expires_idx
  on public.ads (expires_at) where status = 'published';

-- =============================================================================
-- 5. AD_IMAGES — photos d'une annonce (8 maximum)
-- =============================================================================
create table if not exists public.ad_images (
  id           uuid primary key default gen_random_uuid(),
  ad_id        uuid not null references public.ads (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 500),
  "position"   integer not null default 0 check ("position" between 0 and 7),
  width        integer check (width  > 0),
  height       integer check (height > 0),
  byte_size    integer check (byte_size > 0),
  created_at   timestamptz not null default now(),

  unique (ad_id, "position")
);

create index if not exists ad_images_ad_idx on public.ad_images (ad_id, "position");

-- =============================================================================
-- 6. FAVORITES — annonces enregistrées
-- =============================================================================
create table if not exists public.favorites (
  user_id    uuid not null references public.users (id) on delete cascade,
  ad_id      uuid not null references public.ads (id)   on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, ad_id)
);

-- La PK couvre déjà (user_id, ad_id) ; cet index sert le sens inverse
-- (« qui a mis cette annonce en favori »).
create index if not exists favorites_ad_idx on public.favorites (ad_id);
create index if not exists favorites_user_recent_idx
  on public.favorites (user_id, created_at desc);

-- =============================================================================
-- 7. CONVERSATIONS — un fil par couple (annonce, acheteur)
-- =============================================================================
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  ad_id                uuid not null references public.ads (id)   on delete cascade,
  buyer_id             uuid not null references public.users (id) on delete cascade,
  seller_id            uuid not null references public.users (id) on delete cascade,

  -- Dénormalisation : évite un LATERAL JOIN sur `messages` pour afficher la
  -- liste des conversations.
  last_message_at      timestamptz,
  last_message_preview text check (char_length(last_message_preview) <= 160),
  last_sender_id       uuid references public.users (id) on delete set null,
  messages_count       integer not null default 0 check (messages_count >= 0),

  buyer_unread_count   integer not null default 0 check (buyer_unread_count  >= 0),
  seller_unread_count  integer not null default 0 check (seller_unread_count >= 0),

  buyer_archived       boolean not null default false,
  seller_archived      boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Un seul fil par annonce et par acheteur.
  unique (ad_id, buyer_id),
  constraint conversations_distinct_parties check (buyer_id <> seller_id)
);

comment on table public.conversations is
  'Fil de discussion entre un acheteur et le vendeur, à propos d''une annonce.';

create index if not exists conversations_buyer_idx
  on public.conversations (buyer_id, last_message_at desc);
create index if not exists conversations_seller_idx
  on public.conversations (seller_id, last_message_at desc);
create index if not exists conversations_ad_idx on public.conversations (ad_id);

-- =============================================================================
-- 8. MESSAGES — contenu des fils
-- =============================================================================
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.users (id)         on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  attachment_path text check (char_length(attachment_path) <= 500),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Lecture d'un fil : du plus ancien au plus récent.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists messages_unread_idx
  on public.messages (conversation_id) where read_at is null;

-- =============================================================================
-- 9. NOTIFICATIONS — centre de notifications in-app
-- =============================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null check (char_length(title) <= 120),
  body       text check (char_length(body) <= 500),
  -- Lien interne vers la ressource concernée (ex. /annonces/velo-K7QX2M4A).
  link       text check (link is null or link ~ '^/'),
  -- Charge utile libre (identifiants, montants…) pour un rendu enrichi.
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Badge « non lues » : index partiel, très petit et très sollicité.
create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- =============================================================================
-- 10. REVIEWS — avis entre utilisateurs
-- =============================================================================
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  ad_id       uuid references public.ads (id) on delete set null,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  reviewee_id uuid not null references public.users (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 1000),
  status      public.review_status not null default 'published',
  -- Réponse publique du vendeur à l'avis reçu.
  reply       text check (char_length(reply) <= 1000),
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint reviews_no_self check (reviewer_id <> reviewee_id)
);

comment on table public.reviews is
  'Avis laissé après une mise en relation. Alimente users.rating_average par trigger.';

-- Un seul avis par auteur et par annonce.
create unique index if not exists reviews_unique_per_ad_idx
  on public.reviews (reviewer_id, ad_id) where ad_id is not null;

create index if not exists reviews_reviewee_idx
  on public.reviews (reviewee_id, created_at desc) where status = 'published';
create index if not exists reviews_reviewer_idx on public.reviews (reviewer_id);

-- =============================================================================
-- 11. REPORTS — signalements (annonce, utilisateur, message ou avis)
-- =============================================================================
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.users (id) on delete set null,
  target_type  public.report_target_type not null,

  ad_id        uuid references public.ads (id)      on delete cascade,
  target_user_id uuid references public.users (id)  on delete cascade,
  message_id   uuid references public.messages (id) on delete cascade,
  review_id    uuid references public.reviews (id)  on delete cascade,

  reason       public.report_reason not null,
  details      text check (char_length(details) <= 1000),
  status       public.report_status not null default 'open',

  resolved_by  uuid references public.users (id) on delete set null,
  resolved_at  timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000),

  created_at   timestamptz not null default now(),

  -- La cible renseignée doit correspondre au type déclaré.
  constraint reports_target_matches_type check (
    (target_type = 'ad'      and ad_id          is not null and target_user_id is null and message_id is null and review_id is null) or
    (target_type = 'user'    and target_user_id is not null and ad_id          is null and message_id is null and review_id is null) or
    (target_type = 'message' and message_id     is not null and ad_id          is null and target_user_id is null and review_id is null) or
    (target_type = 'review'  and review_id      is not null and ad_id          is null and target_user_id is null and message_id is null)
  )
);

-- File de modération : les signalements ouverts d'abord.
create index if not exists reports_open_idx
  on public.reports (created_at desc) where status in ('open', 'reviewing');
create index if not exists reports_ad_idx   on public.reports (ad_id);
create index if not exists reports_user_idx on public.reports (target_user_id);

-- Un même utilisateur ne signale qu'une fois la même annonce.
create unique index if not exists reports_unique_ad_reporter_idx
  on public.reports (ad_id, reporter_id) where ad_id is not null and reporter_id is not null;

-- =============================================================================
-- 12. SUBSCRIPTION_PLANS — offres commerciales (table de référence)
-- =============================================================================
create table if not exists public.subscription_plans (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[a-z0-9_]+$'),
  name                text not null,
  description         text,
  -- Montant en FCFA (entier : le franc CFA n'a pas de subdivision usuelle).
  price               bigint not null check (price >= 0),
  currency            text not null default 'XAF' check (currency = 'XAF'),
  billing_interval    public.billing_interval not null default 'monthly',

  -- Quotas accordés par l'offre.
  max_active_ads      integer not null default 5 check (max_active_ads > 0),
  featured_ads_quota  integer not null default 0 check (featured_ads_quota >= 0),
  max_images_per_ad   integer not null default 8
                        check (max_images_per_ad between 1 and 8),
  has_priority_support boolean not null default false,
  has_verified_badge   boolean not null default false,

  is_active           boolean not null default true,
  "position"          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Catalogue des offres. Le plan « free » est appliqué par défaut aux comptes sans abonnement actif.';

-- =============================================================================
-- 13. SUBSCRIPTIONS — abonnements souscrits
-- =============================================================================
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users (id) on delete cascade,
  plan_id              uuid not null references public.subscription_plans (id)
                         on delete restrict,

  status               public.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  auto_renew           boolean not null default true,

  started_at           timestamptz not null default now(),
  cancelled_at         timestamptz,
  ended_at             timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint subscriptions_period_order check (current_period_end > current_period_start)
);

-- Au plus un abonnement en cours par utilisateur.
create unique index if not exists subscriptions_one_active_per_user_idx
  on public.subscriptions (user_id) where status in ('trialing', 'active', 'past_due');

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
-- Balayage du renouvellement / de l'expiration par tâche planifiée.
create index if not exists subscriptions_period_end_idx
  on public.subscriptions (current_period_end)
  where status in ('trialing', 'active', 'past_due');

-- =============================================================================
-- 14. PAYMENTS — transactions (Mobile Money, carte, virement)
-- =============================================================================
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  user_id             uuid not null references public.users (id) on delete restrict,

  -- Objet du paiement : au plus une cible renseignée.
  purpose             public.payment_purpose not null,
  subscription_id     uuid references public.subscriptions (id) on delete set null,
  ad_id               uuid references public.ads (id)           on delete set null,

  provider            public.payment_provider not null,
  -- Identifiant de transaction chez l'opérateur (idempotence des callbacks).
  provider_reference  text check (char_length(provider_reference) <= 120),
  -- Numéro Mobile Money utilisé, au format E.164.
  payer_phone         text check (payer_phone ~ '^\+241[0-9]{9}$'),

  amount              bigint not null check (amount > 0),
  currency            text not null default 'XAF' check (currency = 'XAF'),
  status              public.payment_status not null default 'pending',
  failure_reason      text check (char_length(failure_reason) <= 300),

  -- Charge utile brute du fournisseur, conservée pour l'audit.
  metadata            jsonb not null default '{}'::jsonb,

  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payments_single_target check (
    (subscription_id is not null)::int + (ad_id is not null)::int <= 1
  ),
  -- Un paiement abouti porte forcément sa date de règlement.
  constraint payments_paid_at_required check (status <> 'succeeded' or paid_at is not null)
);

comment on table public.payments is
  'Transactions. Écriture réservée au rôle service_role (callbacks opérateur) : jamais depuis le client.';

-- Idempotence des callbacks opérateur : un provider_reference unique par
-- fournisseur empêche le double crédit en cas de rejeu du webhook.
create unique index if not exists payments_provider_reference_idx
  on public.payments (provider, provider_reference) where provider_reference is not null;

create index if not exists payments_user_idx    on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx  on public.payments (status, created_at desc)
  where status in ('pending', 'processing');
create index if not exists payments_subscription_idx on public.payments (subscription_id);
