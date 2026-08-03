-- Reproduction minimale de l'environnement Supabase pour tester les migrations
-- hors ligne : rôles, schémas auth/storage/extensions et fonctions utilitaires.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- Rôles Supabase
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema storage    to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;

-- auth.users — sous-ensemble des colonnes réelles de Supabase utilisées par
-- les triggers applicatifs (handle_new_user, handle_user_updated).
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  -- Supabase stocke le téléphone SANS le « + » (ex. « 2416123456 »).
  phone               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  phone_confirmed_at  timestamptz,
  last_sign_in_at     timestamptz,
  banned_until        timestamptz,
  deleted_at          timestamptz,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  raw_app_meta_data   jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- auth.uid() lit le claim `sub` du JWT porté par la requête.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

-- storage.buckets / storage.objects
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

grant select on storage.buckets to anon, authenticated;
grant all    on storage.objects to anon, authenticated;
