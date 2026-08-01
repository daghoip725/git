-- =============================================================================
--  Daghoip Ikassa — 06. Authentification, rôles et vérification vendeur
-- =============================================================================
--  Cette migration complète le système d'authentification :
--
--   1. Correction du format de téléphone vers un E.164 valide (prérequis de la
--      connexion par SMS : Twilio et Supabase rejettent le zéro national).
--   2. Synchronisation `auth.users` → `public.users` pour tous les fournisseurs
--      (e-mail, Google, Facebook, téléphone) et à la confirmation.
--   3. Demandes de vérification vendeur (badge « vérifié »).
--   4. Gestion des rôles et du statut de compte par RPC contrôlées.
--   5. Journal d'audit des actions sensibles.
-- =============================================================================

-- =============================================================================
-- 1. Format E.164 des numéros gabonais
-- =============================================================================
--  ⚠️ Correction d'un défaut de la migration 01 : le format `+241` suivi du
--  zéro national (`+2410612345 67`) n'est PAS de l'E.164 valide. En E.164, le
--  préfixe national d'acheminement (« 0 ») est retiré :
--
--      saisie locale   06 12 34 56      →  E.164  +2416123456
--      saisie locale   074 12 34 56     →  E.164  +24174123456
--
--  Le plan de numérotation gabonais compte 7 à 9 chiffres significatifs selon
--  l'opérateur et l'ancienneté du numéro : la contrainte les accepte tous.
--  Sans cette correction, l'envoi d'OTP par SMS échouerait systématiquement.
-- -----------------------------------------------------------------------------

-- Normalise un numéro déjà stocké : retire le zéro national s'il est présent.
create or replace function public.to_e164_gabon(p_input text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_input is null or btrim(p_input) = '' then
    return null;
  end if;

  -- Ne garder que les chiffres.
  v_digits := regexp_replace(p_input, '[^0-9]', '', 'g');

  -- Retirer un éventuel préfixe international (00241 ou 241).
  if left(v_digits, 5) = '00241' then
    v_digits := substr(v_digits, 6);
  elsif left(v_digits, 3) = '241' and length(v_digits) > 9 then
    v_digits := substr(v_digits, 4);
  end if;

  -- Retirer le zéro national d'acheminement.
  if left(v_digits, 1) = '0' then
    v_digits := substr(v_digits, 2);
  end if;

  if length(v_digits) between 7 and 9 then
    return '+241' || v_digits;
  end if;

  return null;
end;
$$;

comment on function public.to_e164_gabon(text) is
  'Convertit un numéro gabonais saisi librement en E.164 (+241 + 7 à 9 chiffres, sans zéro national).';

-- Migration des données existantes, puis remplacement des contraintes.
do $$
begin
  update public.users
     set phone    = public.to_e164_gabon(phone),
         whatsapp = public.to_e164_gabon(whatsapp)
   where phone is not null or whatsapp is not null;

  update public.ads
     set contact_phone    = public.to_e164_gabon(contact_phone),
         contact_whatsapp = public.to_e164_gabon(contact_whatsapp)
   where contact_phone is not null or contact_whatsapp is not null;

  update public.payments
     set payer_phone = public.to_e164_gabon(payer_phone)
   where payer_phone is not null;
end
$$;

alter table public.users drop constraint if exists users_phone_check;
alter table public.users add constraint users_phone_check
  check (phone is null or phone ~ '^\+241[0-9]{7,9}$');

alter table public.users drop constraint if exists users_whatsapp_check;
alter table public.users add constraint users_whatsapp_check
  check (whatsapp is null or whatsapp ~ '^\+241[0-9]{7,9}$');

alter table public.ads drop constraint if exists ads_contact_phone_check;
alter table public.ads add constraint ads_contact_phone_check
  check (contact_phone is null or contact_phone ~ '^\+241[0-9]{7,9}$');

alter table public.ads drop constraint if exists ads_contact_whatsapp_check;
alter table public.ads add constraint ads_contact_whatsapp_check
  check (contact_whatsapp is null or contact_whatsapp ~ '^\+241[0-9]{7,9}$');

alter table public.payments drop constraint if exists payments_payer_phone_check;
alter table public.payments add constraint payments_payer_phone_check
  check (payer_phone is null or payer_phone ~ '^\+241[0-9]{7,9}$');

-- Un numéro vérifié par SMS ne doit appartenir qu'à un seul compte.
create unique index if not exists users_phone_unique_idx
  on public.users (phone) where phone is not null;

-- =============================================================================
-- 2. Nouveaux types
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum (
      'pending', 'approved', 'rejected', 'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type public.audit_action as enum (
      'role_changed',
      'status_changed',
      'verification_requested',
      'verification_approved',
      'verification_rejected',
      'ad_moderated',
      'report_resolved'
    );
  end if;
end
$$;

-- Colonnes de suivi de l'authentification.
alter table public.users add column if not exists phone_verified boolean not null default false;
alter table public.users add column if not exists email_verified boolean not null default false;
-- Fournisseur d'inscription : 'email', 'phone', 'google', 'facebook'…
alter table public.users add column if not exists auth_provider text;

comment on column public.users.phone_verified is
  'Vrai lorsque le numéro a été confirmé par OTP SMS (auth.users.phone_confirmed_at).';

-- =============================================================================
-- 3. VERIFICATION_REQUESTS — demandes de badge « vendeur vérifié »
-- =============================================================================
create table if not exists public.verification_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,

  -- Informations déclarées par le demandeur.
  full_legal_name    text not null check (char_length(full_legal_name) between 2 and 120),
  business_name      text check (char_length(business_name) <= 120),
  -- Numéro d'identification (RCCM, NIF) pour un professionnel gabonais.
  business_id_number text check (char_length(business_id_number) <= 60),
  contact_phone      text not null check (contact_phone ~ '^\+241[0-9]{7,9}$'),

  -- Chemins dans le bucket privé `verification-docs`.
  id_document_path       text not null check (char_length(id_document_path) <= 500),
  business_document_path text check (char_length(business_document_path) <= 500),

  status           public.verification_status not null default 'pending',
  reviewed_by      uuid references public.users (id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.verification_requests is
  'Demandes de badge vendeur vérifié. Les pièces justificatives vivent dans le bucket privé verification-docs.';

-- Une seule demande en cours d'instruction par utilisateur.
create unique index if not exists verification_requests_one_pending_idx
  on public.verification_requests (user_id) where status = 'pending';

create index if not exists verification_requests_queue_idx
  on public.verification_requests (created_at) where status = 'pending';
create index if not exists verification_requests_user_idx
  on public.verification_requests (user_id, created_at desc);

drop trigger if exists verification_requests_set_updated_at on public.verification_requests;
create trigger verification_requests_set_updated_at
  before update on public.verification_requests
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. AUTH_AUDIT_LOG — traçabilité des actions sensibles
-- =============================================================================
create table if not exists public.auth_audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references public.users (id) on delete set null,
  action         public.audit_action not null,
  target_user_id uuid references public.users (id) on delete set null,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.auth_audit_log is
  'Journal immuable des changements de rôle, de statut et des décisions de vérification.';

create index if not exists auth_audit_log_target_idx
  on public.auth_audit_log (target_user_id, created_at desc);
create index if not exists auth_audit_log_actor_idx
  on public.auth_audit_log (actor_id, created_at desc);
create index if not exists auth_audit_log_action_idx
  on public.auth_audit_log (action, created_at desc);

-- Écriture réservée aux fonctions SECURITY DEFINER de cette migration.
create or replace function public.log_auth_event(
  p_action         public.audit_action,
  p_target_user_id uuid,
  p_details        jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.auth_audit_log (actor_id, action, target_user_id, details)
  values (auth.uid(), p_action, p_target_user_id, coalesce(p_details, '{}'::jsonb));
$$;

-- =============================================================================
-- 5. Synchronisation auth.users → public.users
-- =============================================================================
--  Couvre les quatre chemins d'inscription :
--   * e-mail + mot de passe        → raw_user_meta_data rempli par l'application
--   * Google / Facebook (OAuth)    → `name`, `full_name`, `given_name`…
--   * téléphone (OTP SMS)          → new.phone, aucune métadonnée
--
--  Note : l'avatar fourni par Google/Facebook n'est volontairement PAS repris.
--  C'est une URL sur un domaine tiers, que la CSP de l'application bloque et
--  qui exposerait la navigation des utilisateurs au fournisseur. L'utilisateur
--  téléverse son avatar dans le bucket `avatars`.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name     text;
  v_phone    text;
  v_provider text;
begin
  -- Nom : métadonnées applicatives, puis conventions OAuth, puis repli.
  v_name := coalesce(
    nullif(btrim(v_meta ->> 'full_name'), ''),
    nullif(btrim(v_meta ->> 'name'), ''),
    nullif(btrim(concat_ws(' ', v_meta ->> 'given_name', v_meta ->> 'family_name')), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Utilisateur'
  );

  -- Supabase stocke le téléphone sans le « + » : on repasse en E.164.
  v_phone := public.to_e164_gabon(
    coalesce(nullif(btrim(new.phone), ''), nullif(btrim(v_meta ->> 'phone'), ''))
  );

  v_provider := coalesce(
    nullif(v_meta ->> 'provider', ''),
    new.raw_app_meta_data ->> 'provider',
    case when new.phone is not null then 'phone' else 'email' end
  );

  insert into public.users (
    id, full_name, phone, city, auth_provider, phone_verified, email_verified
  )
  values (
    new.id,
    left(v_name, 80),
    v_phone,
    nullif(btrim(v_meta ->> 'city'), ''),
    v_provider,
    new.phone_confirmed_at is not null,
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;

  return new;
exception
  -- Un numéro déjà rattaché à un autre compte ne doit pas faire échouer
  -- l'inscription : le profil est créé sans téléphone, l'utilisateur le
  -- corrigera depuis son espace personnel.
  when unique_violation then
    insert into public.users (id, full_name, city, auth_provider, email_verified)
    values (new.id, left(v_name, 80), nullif(btrim(v_meta ->> 'city'), ''), v_provider,
            new.email_confirmed_at is not null)
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Répercute les confirmations d'e-mail et de téléphone après coup.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  v_phone := public.to_e164_gabon(new.phone);

  update public.users u
     set email_verified = new.email_confirmed_at is not null,
         phone_verified = new.phone_confirmed_at is not null,
         -- Le numéro n'est repris que s'il a été confirmé par OTP et n'est pas
         -- déjà rattaché à un autre compte.
         phone = case
           when new.phone_confirmed_at is not null
                and v_phone is not null
                and not exists (
                  select 1 from public.users o where o.phone = v_phone and o.id <> new.id
                )
           then v_phone
           else u.phone
         end
   where u.id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email_confirmed_at, phone_confirmed_at, phone on auth.users
  for each row execute function public.handle_user_updated();

-- =============================================================================
-- 6. Vérification vendeur
-- =============================================================================

-- Dépose une demande. `security invoker` : la RLS valide l'insertion.
create or replace function public.request_verification(
  p_full_legal_name       text,
  p_contact_phone         text,
  p_id_document_path      text,
  p_business_name         text default null,
  p_business_id_number    text default null,
  p_business_document_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_phone text;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.users where id = v_user and is_verified
  ) then
    raise exception 'Votre compte est déjà vérifié.' using errcode = 'P0001';
  end if;

  v_phone := public.to_e164_gabon(p_contact_phone);
  if v_phone is null then
    raise exception 'Numéro de téléphone gabonais invalide.' using errcode = 'P0001';
  end if;

  -- Les pièces doivent se trouver dans le dossier privé du demandeur.
  if p_id_document_path !~ ('^' || v_user::text || '/') then
    raise exception 'Chemin de document invalide.' using errcode = 'P0001';
  end if;
  if p_business_document_path is not null
     and p_business_document_path !~ ('^' || v_user::text || '/') then
    raise exception 'Chemin de document invalide.' using errcode = 'P0001';
  end if;

  insert into public.verification_requests (
    user_id, full_legal_name, business_name, business_id_number, contact_phone,
    id_document_path, business_document_path
  )
  values (
    v_user, btrim(p_full_legal_name), nullif(btrim(p_business_name), ''),
    nullif(btrim(p_business_id_number), ''), v_phone,
    p_id_document_path, p_business_document_path
  )
  returning id into v_id;

  perform public.log_auth_event('verification_requested', v_user,
                                jsonb_build_object('request_id', v_id));

  return v_id;
end;
$$;

-- Instruit une demande. Réservée au staff.
create or replace function public.review_verification(
  p_request_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.verification_requests;
begin
  if not public.is_staff() then
    raise exception 'Action réservée à l’équipe de modération.' using errcode = '42501';
  end if;

  select * into v_request
    from public.verification_requests
   where id = p_request_id
   for update;

  if v_request.id is null then
    raise exception 'Demande introuvable.' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Cette demande a déjà été instruite.' using errcode = 'P0001';
  end if;

  if p_approve then
    update public.verification_requests
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_request_id;

    -- Seule cette fonction peut poser le badge : `is_verified` est hors du
    -- GRANT UPDATE accordé aux utilisateurs.
    update public.users
       set is_verified = true,
           business_name = coalesce(v_request.business_name, business_name),
           is_professional = case
             when v_request.business_name is not null then true else is_professional
           end
     where id = v_request.user_id;

    perform public.log_auth_event('verification_approved', v_request.user_id,
                                  jsonb_build_object('request_id', p_request_id));

    perform public.create_notification(
      v_request.user_id, 'system', 'Votre compte est vérifié',
      'Le badge « vendeur vérifié » est désormais affiché sur vos annonces.',
      '/compte/verification',
      jsonb_build_object('request_id', p_request_id)
    );
  else
    update public.verification_requests
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           rejection_reason = nullif(btrim(p_reason), '')
     where id = p_request_id;

    perform public.log_auth_event('verification_rejected', v_request.user_id,
                                  jsonb_build_object('request_id', p_request_id,
                                                     'reason', p_reason));

    perform public.create_notification(
      v_request.user_id, 'system', 'Demande de vérification refusée',
      coalesce(nullif(btrim(p_reason), ''),
               'Les pièces fournies n’ont pas permis de valider votre identité.'),
      '/compte/verification',
      jsonb_build_object('request_id', p_request_id)
    );
  end if;
end;
$$;

-- =============================================================================
-- 7. Gestion des rôles et du statut de compte
-- =============================================================================
--  `users.role` et `users.status` sont hors du GRANT UPDATE : ces deux RPC sont
--  le SEUL chemin d'écriture, et elles vérifient elles-mêmes l'autorisation.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.user_role;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;

  -- Un administrateur ne modifie pas son propre rôle : évite qu'il se retire
  -- ses droits par mégarde et se verrouille hors de l'administration.
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle.' using errcode = 'P0001';
  end if;

  select role into v_previous from public.users where id = p_user_id;
  if v_previous is null then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;
  if v_previous = p_role then
    return;
  end if;

  -- Il doit toujours rester au moins un administrateur.
  if v_previous = 'admin' and p_role <> 'admin'
     and (select count(*) from public.users where role = 'admin') <= 1 then
    raise exception 'Impossible de retirer le dernier administrateur.' using errcode = 'P0001';
  end if;

  update public.users set role = p_role where id = p_user_id;

  perform public.log_auth_event('role_changed', p_user_id,
    jsonb_build_object('from', v_previous, 'to', p_role));

  perform public.create_notification(
    p_user_id, 'system', 'Vos droits ont été modifiés',
    'Votre rôle sur Daghoip Ikassa est désormais : ' || p_role || '.',
    '/compte'
  );
end;
$$;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status  public.account_status,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.users;
begin
  if not public.is_staff() then
    raise exception 'Action réservée à l’équipe de modération.' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier votre propre statut.' using errcode = 'P0001';
  end if;

  select * into v_target from public.users where id = p_user_id;
  if v_target.id is null then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0001';
  end if;

  -- Un modérateur ne peut pas sanctionner un autre membre de l'équipe.
  if v_target.role in ('moderator', 'admin') and not public.is_admin() then
    raise exception 'Seul un administrateur peut agir sur ce compte.' using errcode = '42501';
  end if;

  update public.users set status = p_status where id = p_user_id;

  -- Un compte suspendu ou banni voit ses annonces retirées de la vitrine.
  if p_status in ('suspended', 'banned') then
    update public.ads set status = 'archived'
     where seller_id = p_user_id and status = 'published';
  end if;

  perform public.log_auth_event('status_changed', p_user_id,
    jsonb_build_object('from', v_target.status, 'to', p_status, 'reason', p_reason));

  if p_status = 'active' then
    perform public.create_notification(
      p_user_id, 'system', 'Votre compte est réactivé',
      'Vous pouvez de nouveau publier des annonces.', '/compte'
    );
  end if;
end;
$$;

-- Retire le badge vérifié (staff).
create or replace function public.admin_revoke_verification(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Action réservée à l’équipe de modération.' using errcode = '42501';
  end if;

  update public.users set is_verified = false where id = p_user_id;

  perform public.log_auth_event('verification_rejected', p_user_id,
    jsonb_build_object('revoked', true, 'reason', p_reason));
end;
$$;

-- Retire une annonce de la vitrine depuis la file de modération.
--
-- Passe par une RPC plutôt que par un UPDATE direct : `rejection_reason` est
-- volontairement hors du GRANT UPDATE accordé au rôle `authenticated`, pour
-- qu'un vendeur ne puisse pas rédiger lui-même le motif de refus de son
-- annonce. Seule cette fonction, qui vérifie `is_staff()`, peut l'écrire.
create or replace function public.admin_moderate_ad(
  p_ad_id  uuid,
  p_action text,               -- 'archive' | 'reject' | 'restore'
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_title  text;
begin
  if not public.is_staff() then
    raise exception 'Action réservée à l’équipe de modération.' using errcode = '42501';
  end if;

  if p_action not in ('archive', 'reject', 'restore') then
    raise exception 'Action de modération inconnue.' using errcode = 'P0001';
  end if;

  select seller_id, title into v_seller, v_title from public.ads where id = p_ad_id;
  if v_seller is null then
    raise exception 'Annonce introuvable.' using errcode = 'P0001';
  end if;

  update public.ads
     set status = case p_action
                    when 'reject'  then 'rejected'::public.ad_status
                    when 'archive' then 'archived'::public.ad_status
                    else 'published'::public.ad_status
                  end,
         rejection_reason = case when p_action = 'restore' then null
                                 else nullif(btrim(p_reason), '') end
   where id = p_ad_id;

  perform public.log_auth_event('ad_moderated', v_seller,
    jsonb_build_object('ad_id', p_ad_id, 'action', p_action, 'reason', p_reason));

  if p_action <> 'restore' then
    perform public.create_notification(
      v_seller, 'ad_rejected', 'Votre annonce a été retirée',
      coalesce(nullif(btrim(p_reason), ''),
               '« ' || v_title || ' » ne respecte pas nos conditions d’utilisation.'),
      '/compte/annonces',
      jsonb_build_object('ad_id', p_ad_id)
    );
  end if;
end;
$$;

-- =============================================================================
-- 8. RLS et privilèges des nouvelles tables
-- =============================================================================
alter table public.verification_requests enable row level security;
alter table public.auth_audit_log         enable row level security;

-- --- verification_requests ----------------------------------------------------
drop policy if exists verification_requests_select_own on public.verification_requests;
create policy verification_requests_select_own
  on public.verification_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists verification_requests_insert_own on public.verification_requests;
create policy verification_requests_insert_own
  on public.verification_requests for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_account());

-- Le demandeur ne peut qu'annuler sa demande (colonne `status` accordée) ;
-- l'instruction passe par `review_verification()`.
drop policy if exists verification_requests_update_own on public.verification_requests;
create policy verification_requests_update_own
  on public.verification_requests for update
  to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid());

drop policy if exists verification_requests_staff on public.verification_requests;
create policy verification_requests_staff
  on public.verification_requests for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- --- auth_audit_log -----------------------------------------------------------
-- Lecture réservée au staff ; aucune écriture client (journal immuable).
drop policy if exists auth_audit_log_select_staff on public.auth_audit_log;
create policy auth_audit_log_select_staff
  on public.auth_audit_log for select
  to authenticated
  using (public.is_staff());

revoke all on public.verification_requests from anon, authenticated;
grant select on public.verification_requests to authenticated;
grant insert (
  user_id, full_legal_name, business_name, business_id_number, contact_phone,
  id_document_path, business_document_path
) on public.verification_requests to authenticated;
-- Le demandeur annule ; le staff instruit via la RPC.
grant update (status, reviewed_by, reviewed_at, rejection_reason)
  on public.verification_requests to authenticated;

revoke all on public.auth_audit_log from anon, authenticated;
grant select on public.auth_audit_log to authenticated;

-- Nouvelles colonnes de `users` : lisibles publiquement, non modifiables.
grant select (phone_verified, email_verified) on public.users to anon, authenticated;

-- =============================================================================
-- 9. Droits d'exécution
-- =============================================================================
grant execute on function public.to_e164_gabon(text) to anon, authenticated;
grant execute on function public.request_verification(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.review_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.account_status, text)
  to authenticated;
grant execute on function public.admin_revoke_verification(uuid, text) to authenticated;
grant execute on function public.admin_moderate_ad(uuid, text, text) to authenticated;

-- `log_auth_event` reste non accordée : elle n'est appelable que depuis les
-- fonctions SECURITY DEFINER de cette migration, qui s'exécutent en tant que
-- propriétaire. Le journal ne peut donc pas être pollué depuis le client.
