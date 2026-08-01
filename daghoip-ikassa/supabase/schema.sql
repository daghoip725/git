-- =============================================================================
--  Daghoip Ikassa — Schéma PostgreSQL / Supabase
-- =============================================================================
--  Plateforme de petites annonces pour le Gabon.
--
--  Ce fichier est idempotent : il peut être rejoué sans casser une base existante.
--  À exécuter dans le SQL Editor de Supabase, ou via la CLI :
--      supabase db push
--
--  Modèle de sécurité
--  ------------------
--   * RLS activée sur TOUTES les tables du schéma `public`.
--   * L'application n'utilise que la clé anonyme : l'autorisation est
--     entièrement décidée par PostgreSQL.
--   * Les coordonnées privées d'un profil (téléphone, WhatsApp) ne sont pas
--     lisibles publiquement : la lecture publique est restreinte AU NIVEAU
--     DES COLONNES (`grant select (…)`), et le propriétaire récupère sa fiche
--     complète via la fonction `public.get_my_profile()`.
--   * Les colonnes sensibles (`role`, `is_verified`, `is_featured`,
--     `views_count`, …) ne sont pas modifiables par les utilisateurs : elles
--     sont exclues des `grant update (…)` et re-forcées par trigger.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "unaccent" with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Types énumérés
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type public.listing_status as enum (
      'draft', 'pending_review', 'published', 'sold', 'expired', 'rejected', 'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'listing_condition') then
    create type public.listing_condition as enum (
      'new', 'like_new', 'good', 'fair', 'for_parts'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'price_type') then
    create type public.price_type as enum ('fixed', 'negotiable', 'free', 'on_request');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_reason') then
    create type public.report_reason as enum (
      'spam', 'fraud', 'prohibited', 'duplicate', 'wrong_category', 'offensive', 'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'moderator', 'admin');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Fonctions utilitaires
-- -----------------------------------------------------------------------------

-- Horodatage automatique de `updated_at`.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Référence publique courte et non devinable (ex. « K7QX2M4A »).
-- L'alphabet exclut I, O, 0 et 1 pour éviter les confusions à la lecture.
create or replace function public.generate_reference()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- `unaccent` figé (forme à `regdictionary`, réellement IMMUTABLE).
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

-- Rôle de l'utilisateur courant.
-- SECURITY DEFINER : la fonction s'exécute avec les droits du propriétaire, ce
-- qui contourne la RLS de `profiles` et évite toute récursion de politique.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'user'::public.user_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select public.current_user_role() in ('moderator', 'admin');
$$;

-- -----------------------------------------------------------------------------
-- 3. Table `profiles`
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null check (char_length(full_name) between 2 and 80),
  phone           text check (phone ~ '^\+241[0-9]{9}$'),
  whatsapp        text check (whatsapp ~ '^\+241[0-9]{9}$'),
  city            text check (char_length(city) <= 80),
  province        text check (char_length(province) <= 80),
  avatar_url      text check (char_length(avatar_url) <= 500),
  bio             text check (char_length(bio) <= 500),
  is_professional boolean not null default false,
  is_verified     boolean not null default false,
  role            public.user_role not null default 'user',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'Profil utilisateur adossé à auth.users. Les colonnes phone/whatsapp ne sont pas lisibles publiquement (voir les GRANT en fin de fichier).';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, city)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'utilisateur'), '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'city'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fiche complète du profil connecté (colonnes privées incluses).
-- Nécessaire car la lecture publique de `profiles` est restreinte par colonnes.
create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 4. Table `categories`
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  icon        text,
  description text,
  parent_id   uuid references public.categories (id) on delete set null,
  "position"  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_position_idx on public.categories ("position");

-- -----------------------------------------------------------------------------
-- 5. Table `listings`
-- -----------------------------------------------------------------------------
create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique default public.generate_reference(),
  seller_id        uuid not null references public.profiles (id) on delete cascade,
  category_id      uuid not null references public.categories (id) on delete restrict,
  title            text not null check (char_length(title) between 5 and 120),
  slug             text not null default '',
  description      text not null check (char_length(description) between 20 and 5000),
  price            bigint check (price >= 0 and price <= 5000000000),
  price_type       public.price_type not null default 'fixed',
  currency         text not null default 'XAF' check (currency = 'XAF'),
  condition        public.listing_condition,
  city             text not null check (char_length(city) between 2 and 80),
  province         text check (char_length(province) <= 80),
  district         text check (char_length(district) <= 80),
  contact_phone    text check (contact_phone ~ '^\+241[0-9]{9}$'),
  contact_whatsapp text check (contact_whatsapp ~ '^\+241[0-9]{9}$'),
  allow_messages   boolean not null default true,
  status           public.listing_status not null default 'published',
  is_featured      boolean not null default false,
  views_count      integer not null default 0 check (views_count >= 0),
  favorites_count  integer not null default 0 check (favorites_count >= 0),
  published_at     timestamptz,
  expires_at       timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),
  search_vector    tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Un prix est obligatoire dès lors que la modalité en suppose un.
  constraint listings_price_required check (
    price_type in ('free', 'on_request') or price is not null
  ),
  -- Une annonce doit exposer au moins un canal de contact.
  constraint listings_contact_required check (
    allow_messages or contact_phone is not null or contact_whatsapp is not null
  )
);

comment on table public.listings is 'Annonces publiées sur Daghoip Ikassa.';

create index if not exists listings_status_published_idx
  on public.listings (status, published_at desc);
create index if not exists listings_category_idx on public.listings (category_id);
create index if not exists listings_seller_idx on public.listings (seller_id);
create index if not exists listings_city_idx on public.listings (city);
create index if not exists listings_price_idx on public.listings (price);
create index if not exists listings_slug_ref_idx on public.listings (reference);
create index if not exists listings_featured_idx
  on public.listings (is_featured, published_at desc) where status = 'published';
create index if not exists listings_search_idx on public.listings using gin (search_vector);

-- Trigger central de l'annonce :
--   * dérive le slug depuis le titre ;
--   * recalcule l'index de recherche plein texte ;
--   * pose les dates de publication / expiration ;
--   * verrouille les champs privilégiés contre toute modification par le vendeur.
create or replace function public.listings_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- --- Champs privilégiés : seul le staff (ou service_role) peut les fixer ---
  if not public.is_staff() then
    if tg_op = 'INSERT' then
      new.is_featured     := false;
      new.views_count     := 0;
      new.favorites_count := 0;
    else
      new.is_featured     := old.is_featured;
      new.views_count     := old.views_count;
      new.favorites_count := old.favorites_count;
      new.reference       := old.reference;
      new.seller_id       := old.seller_id;
      new.created_at      := old.created_at;
      new.rejection_reason := old.rejection_reason;
    end if;
  end if;

  -- --- Slug dérivé du titre (ASCII, minuscules, tirets) ---
  if new.slug is null or new.slug = ''
     or (tg_op = 'UPDATE' and new.title is distinct from old.title) then
    new.slug := trim(both '-' from
      regexp_replace(lower(public.immutable_unaccent(new.title)), '[^a-z0-9]+', '-', 'g')
    );
    new.slug := trim(both '-' from left(new.slug, 70));
    if new.slug = '' then new.slug := 'annonce'; end if;
  end if;

  -- --- Recherche plein texte pondérée : titre > ville > description ---
  new.search_vector :=
      setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.title, ''))), 'A')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.city, ''))), 'B')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.description, ''))), 'C');

  -- --- Dates gérées par la base ---
  if new.status = 'published' then
    if new.published_at is null then new.published_at := now(); end if;
    if new.expires_at is null then new.expires_at := now() + interval '60 days'; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_before_write on public.listings;
create trigger listings_before_write
  before insert or update on public.listings
  for each row execute function public.listings_before_write();

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Table `listing_images`
-- -----------------------------------------------------------------------------
create table if not exists public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 500),
  "position"   integer not null default 0 check ("position" between 0 and 7),
  width        integer check (width > 0),
  height       integer check (height > 0),
  created_at   timestamptz not null default now(),
  unique (listing_id, "position")
);

create index if not exists listing_images_listing_idx
  on public.listing_images (listing_id, "position");

-- Plafonne le nombre de photos par annonce (8).
create or replace function public.enforce_image_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.listing_images where listing_id = new.listing_id) >= 8 then
    raise exception 'Une annonce ne peut pas dépasser 8 photos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists listing_images_limit on public.listing_images;
create trigger listing_images_limit
  before insert on public.listing_images
  for each row execute function public.enforce_image_limit();

-- -----------------------------------------------------------------------------
-- 7. Table `favorites`
-- -----------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists favorites_listing_idx on public.favorites (listing_id);

-- Compteur dénormalisé `listings.favorites_count`.
create or replace function public.sync_favorites_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings
       set favorites_count = favorites_count + 1
     where id = new.listing_id;
    return new;
  end if;

  update public.listings
     set favorites_count = greatest(favorites_count - 1, 0)
   where id = old.listing_id;
  return old;
end;
$$;

drop trigger if exists favorites_count_sync on public.favorites;
create trigger favorites_count_sync
  after insert or delete on public.favorites
  for each row execute function public.sync_favorites_count();

-- -----------------------------------------------------------------------------
-- 8. Table `messages`
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 2 and 2000),
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint messages_no_self check (sender_id <> recipient_id)
);

create index if not exists messages_recipient_idx
  on public.messages (recipient_id, created_at desc);
create index if not exists messages_thread_idx
  on public.messages (listing_id, created_at);

-- -----------------------------------------------------------------------------
-- 9. Table `reports` (signalements)
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      public.report_reason not null,
  details     text check (char_length(details) <= 1000),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);
create unique index if not exists reports_unique_per_user
  on public.reports (listing_id, reporter_id) where reporter_id is not null;

-- -----------------------------------------------------------------------------
-- 10. Fonctions RPC exposées à l'application
-- -----------------------------------------------------------------------------

-- Incrémente le compteur de vues sans accorder de droit UPDATE sur l'annonce.
create or replace function public.increment_listing_views(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings
     set views_count = views_count + 1
   where id = p_listing_id
     and status = 'published';
end;
$$;

-- Ajoute/retire un favori et renvoie l'état final (true = en favori).
create or replace function public.toggle_favorite(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_exists boolean;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.listings
     where id = p_listing_id and status in ('published', 'sold')
  ) then
    raise exception 'Annonce introuvable.' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.favorites where user_id = v_user and listing_id = p_listing_id
  ) into v_exists;

  if v_exists then
    delete from public.favorites where user_id = v_user and listing_id = p_listing_id;
    return false;
  end if;

  insert into public.favorites (user_id, listing_id) values (v_user, p_listing_id);
  return true;
end;
$$;

-- Bascule les annonces arrivées à échéance. À planifier via pg_cron :
--   select cron.schedule('expire-listings', '0 3 * * *', $$select public.expire_listings()$$);
create or replace function public.expire_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.listings
     set status = 'expired'
   where status = 'published'
     and expires_at is not null
     and expires_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- =============================================================================
-- 11. Row Level Security
-- =============================================================================
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites      enable row level security;
alter table public.messages       enable row level security;
alter table public.reports        enable row level security;

-- --- profiles ----------------------------------------------------------------
-- Toutes les lignes sont visibles, mais seules les colonnes publiques sont
-- accessibles (voir les `grant select (…)` de la section 13).
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- `role` et `is_verified` sont hors du `grant update (…)` : aucune élévation
-- de privilège n'est possible depuis le client.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- categories --------------------------------------------------------------
drop policy if exists "categories_select_active" on public.categories;
create policy "categories_select_active"
  on public.categories for select
  using (is_active or public.is_staff());

drop policy if exists "categories_write_staff" on public.categories;
create policy "categories_write_staff"
  on public.categories for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- --- listings ----------------------------------------------------------------
-- Lecture : annonces publiées ou vendues pour tout le monde ; le vendeur et le
-- staff voient également brouillons, annonces expirées et refusées.
drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
  on public.listings for select
  using (
    status in ('published', 'sold')
    or seller_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own"
  on public.listings for insert
  to authenticated
  with check (
    seller_id = auth.uid()
    and status in ('draft', 'pending_review', 'published')
  );

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own"
  on public.listings for update
  to authenticated
  using (seller_id = auth.uid() or public.is_staff())
  with check (seller_id = auth.uid() or public.is_staff());

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own"
  on public.listings for delete
  to authenticated
  using (seller_id = auth.uid() or public.is_staff());

-- --- listing_images ----------------------------------------------------------
drop policy if exists "listing_images_select_public" on public.listing_images;
create policy "listing_images_select_public"
  on public.listing_images for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status in ('published', 'sold') or l.seller_id = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "listing_images_write_owner" on public.listing_images;
create policy "listing_images_write_owner"
  on public.listing_images for all
  to authenticated
  using (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
    or public.is_staff()
  )
  with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
    or public.is_staff()
  );

-- --- favorites ---------------------------------------------------------------
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites for delete
  to authenticated
  using (user_id = auth.uid());

-- --- messages ----------------------------------------------------------------
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- L'expéditeur est forcément l'utilisateur courant. L'échange doit porter sur
-- une annonce publiée qui accepte la messagerie, et impliquer son vendeur
-- (l'acheteur écrit au vendeur, ou le vendeur répond à un acheteur).
drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.allow_messages
        and l.status = 'published'
        and (l.seller_id = recipient_id or l.seller_id = auth.uid())
    )
  );

-- Seul le destinataire peut marquer un message comme lu (`read_at`).
drop policy if exists "messages_update_recipient" on public.messages;
create policy "messages_update_recipient"
  on public.messages for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- --- reports -----------------------------------------------------------------
drop policy if exists "reports_insert_authenticated" on public.reports;
create policy "reports_insert_authenticated"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "reports_select_own_or_staff" on public.reports;
create policy "reports_select_own_or_staff"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_staff());

drop policy if exists "reports_update_staff" on public.reports;
create policy "reports_update_staff"
  on public.reports for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- 12. Storage : bucket public des photos d'annonces
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880, -- 5 Mo
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Convention de chemin : `<user_id>/<listing_id>/<uuid>.<ext>`.
-- Le premier segment doit correspondre à l'utilisateur authentifié : un
-- utilisateur ne peut donc ni écraser ni supprimer les images d'un autre.
drop policy if exists "listing_images_public_read" on storage.objects;
create policy "listing_images_public_read"
  on storage.objects for select
  using (bucket_id = 'listing-images');

drop policy if exists "listing_images_owner_insert" on storage.objects;
create policy "listing_images_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing_images_owner_update" on storage.objects;
create policy "listing_images_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing_images_owner_delete" on storage.objects;
create policy "listing_images_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 13. Droits (privilèges de colonnes = seconde ligne de défense)
-- =============================================================================
grant usage on schema public to anon, authenticated;

-- Profils : lecture publique limitée aux colonnes non sensibles.
revoke all on public.profiles from anon, authenticated;
grant select (
  id, full_name, avatar_url, city, province, bio,
  is_professional, is_verified, created_at
) on public.profiles to anon, authenticated;
grant insert on public.profiles to authenticated;
-- `role` et `is_verified` sont volontairement absents : pas d'auto-promotion.
grant update (
  full_name, phone, whatsapp, city, province, avatar_url, bio, is_professional
) on public.profiles to authenticated;

-- Catégories : lecture pour tous, écriture réservée au staff (RLS).
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

-- Annonces : lecture pour tous ; les compteurs et la mise en avant ne sont pas
-- modifiables par le client (voir aussi le trigger `listings_before_write`).
grant select on public.listings to anon, authenticated;
grant insert on public.listings to authenticated;
grant update (
  title, description, category_id, price, price_type, condition,
  city, province, district, contact_phone, contact_whatsapp,
  allow_messages, status, expires_at
) on public.listings to authenticated;
grant delete on public.listings to authenticated;

grant select on public.listing_images to anon, authenticated;
grant insert, update, delete on public.listing_images to authenticated;

grant select, insert, delete on public.favorites to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

grant execute on function public.increment_listing_views(uuid) to anon, authenticated;
grant execute on function public.toggle_favorite(uuid) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.current_user_role() to anon, authenticated;
