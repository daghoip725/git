-- =============================================================================
--  Daghoip Ikassa — 11. Système de paiement
-- =============================================================================
--  Complète la table `payments` (déjà en place) avec ce qu'il faut pour
--  encaisser réellement : ouverture d'un paiement, journal des rappels
--  d'opérateur, application idempotente d'un callback, et facturation.
--
--  Principe directeur : **le montant ne vient jamais du client**. Le navigateur
--  n'envoie qu'un code d'offre ; le prix est relu ici, dans la table qui fait
--  foi. Un paiement ne change de statut que par `apply_payment_callback()`,
--  réservée à `service_role` — c'est-à-dire au serveur, jamais au navigateur.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. CORRECTION : NUMÉRO DU PAYEUR
-- =============================================================================
--  La contrainte d'origine exigeait neuf chiffres après « +241 ». Or la
--  numérotation gabonaise en E.164 en compte 7 à 9 (migration 06) : un numéro
--  parfaitement valide comme +2416123456 était rejeté, et tout paiement
--  renseignant le payeur échouait. On aligne sur la règle des comptes.
alter table public.payments drop constraint if exists payments_payer_phone_check;
alter table public.payments
  add constraint payments_payer_phone_check
  check (payer_phone is null or payer_phone ~ '^\+241[0-9]{7,9}$');

-- =============================================================================
-- 2. FACTURATION
-- =============================================================================
--  Numérotation **sans trou et par exercice**. Une séquence PostgreSQL ne
--  conviendrait pas : elle laisse des trous au moindre `rollback`, ce qu'une
--  numérotation de factures ne tolère pas. Un compteur verrouillé le temps de
--  la transaction s'en charge.
create table if not exists public.invoice_counters (
  year        integer primary key check (year between 2020 and 2200),
  last_number bigint  not null default 0 check (last_number >= 0)
);

comment on table public.invoice_counters is
  'Compteur de factures par exercice. Verrouillé le temps de la transaction : la numérotation reste sans trou.';

alter table public.invoice_counters enable row level security;
-- Aucune politique : la table n'est touchée que par des fonctions SECURITY DEFINER.
revoke all on public.invoice_counters from anon, authenticated;

alter table public.payments add column if not exists invoice_number text;
alter table public.payments add column if not exists invoiced_at timestamptz;

create unique index if not exists payments_invoice_number_idx
  on public.payments (invoice_number)
  where invoice_number is not null;

/** Numéro de facture suivant, de la forme `DI-FAC-2026-000042`. */
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   integer := extract(year from now())::integer;
  v_number bigint;
begin
  insert into public.invoice_counters (year, last_number)
  values (v_year, 0)
  on conflict (year) do nothing;

  -- `update … returning` verrouille la ligne : deux paiements confirmés en même
  -- temps ne peuvent pas obtenir le même numéro.
  update public.invoice_counters
     set last_number = last_number + 1
   where year = v_year
  returning last_number into v_number;

  return 'DI-FAC-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

-- =============================================================================
-- 3. JOURNAL DES RAPPELS D'OPÉRATEUR
-- =============================================================================
--  Chaque appel reçu est consigné **avant** d'être appliqué, y compris ceux
--  dont la signature est invalide : c'est la seule façon de constater après
--  coup qu'un opérateur a mal configuré ses clés — ou qu'on a été sondé.
create table if not exists public.payment_events (
  id               uuid primary key default gen_random_uuid(),
  payment_id       uuid references public.payments (id) on delete set null,
  provider         public.payment_provider not null,
  event_type       text not null check (char_length(event_type) <= 60),
  provider_reference text check (char_length(provider_reference) <= 120),
  signature_valid  boolean not null,
  applied          boolean not null default false,
  payload          jsonb not null default '{}'::jsonb,
  received_at      timestamptz not null default now()
);

comment on table public.payment_events is
  'Rappels reçus des opérateurs Mobile Money, consignés avant application.';

create index if not exists payment_events_payment_idx on public.payment_events (payment_id);
create index if not exists payment_events_received_idx on public.payment_events (received_at desc);

alter table public.payment_events enable row level security;

drop policy if exists payment_events_select_staff on public.payment_events;
create policy payment_events_select_staff
  on public.payment_events for select
  to authenticated
  using (public.is_staff());

revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_events to authenticated; -- RLS : staff

-- =============================================================================
-- 4. OUVERTURE D'UN PAIEMENT D'ABONNEMENT
-- =============================================================================
--  Le client n'envoie qu'un **code d'offre**. Le prix, l'intervalle de
--  facturation et les quotas sont relus ici. L'abonnement est créé au statut
--  `past_due` — il n'accorde donc encore aucun droit — et ne devient actif
--  qu'à la confirmation du paiement.
create or replace function public.request_subscription(
  p_plan_code   text,
  p_provider    public.payment_provider default 'airtel_money',
  p_payer_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user         uuid := auth.uid();
  v_plan         public.subscription_plans;
  v_subscription uuid;
  v_payment      uuid;
  v_phone        text;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if not public.is_active_account() then
    raise exception 'Votre compte ne permet pas cette opération.' using errcode = '42501';
  end if;

  select * into v_plan
    from public.subscription_plans
   where code = p_plan_code and is_active;

  if v_plan.id is null then
    raise exception 'Offre inconnue ou désactivée.' using errcode = 'P0001';
  end if;
  if v_plan.price <= 0 then
    raise exception 'Cette offre est gratuite : aucun paiement n''est nécessaire.'
      using errcode = 'P0001';
  end if;

  v_phone := public.to_e164_gabon(p_payer_phone);
  if p_payer_phone is not null and btrim(p_payer_phone) <> '' and v_phone is null then
    raise exception 'Numéro Mobile Money invalide.' using errcode = 'P0001';
  end if;

  -- Un seul paiement d'abonnement en attente à la fois : sans cela, un double
  -- clic ouvrirait deux demandes chez l'opérateur.
  if exists (
    select 1 from public.payments
     where user_id = v_user
       and purpose = 'subscription'
       and status in ('pending', 'processing')
  ) then
    raise exception 'Un paiement d''abonnement est déjà en attente.' using errcode = 'P0001';
  end if;

  -- Abonnement existant réutilisé s'il porte déjà cette offre, sinon créé.
  select id into v_subscription
    from public.subscriptions
   where user_id = v_user and plan_id = v_plan.id
   order by created_at desc
   limit 1;

  if v_subscription is null then
    -- Période déjà close (`current_period_end = now()`) : l'abonnement existe
    -- pour porter le paiement, mais n'ouvre aucun droit tant que l'opérateur
    -- n'a pas confirmé. `get_active_plan()` exige `current_period_end > now()`,
    -- la fenêtre est donc vide au sens strict. Une fenêtre de durée nulle
    -- serait refusée par `subscriptions_period_order`, d'où le décalage d'une
    -- seconde en arrière du début.
    insert into public.subscriptions (
      user_id, plan_id, status, current_period_start, current_period_end
    )
    values (v_user, v_plan.id, 'past_due', now() - interval '1 second', now())
    returning id into v_subscription;
  end if;

  insert into public.payments (
    user_id, purpose, subscription_id, provider, payer_phone, amount, status, metadata
  )
  values (
    v_user, 'subscription', v_subscription, p_provider, v_phone, v_plan.price, 'pending',
    jsonb_build_object(
      'plan_code', v_plan.code,
      'plan_name', v_plan.name,
      'billing_interval', v_plan.billing_interval
    )
  )
  returning id into v_payment;

  return v_payment;
end;
$$;

comment on function public.request_subscription(text, public.payment_provider, text) is
  'Ouvre un paiement d''abonnement. Le tarif est relu en base, jamais transmis par le client.';

-- =============================================================================
-- 5. ANNULATION PAR LE PAYEUR
-- =============================================================================
create or replace function public.cancel_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_status public.payment_status;
begin
  select status into v_status
    from public.payments
   where id = p_payment_id and user_id = v_user;

  if v_status is null then
    raise exception 'Paiement introuvable.' using errcode = 'P0001';
  end if;
  -- Un paiement abouti ne s'annule pas d'un clic : cela relève du remboursement.
  if v_status <> 'pending' then
    raise exception 'Ce paiement ne peut plus être annulé.' using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'cancelled', updated_at = now()
   where id = p_payment_id;
end;
$$;

-- =============================================================================
-- 6. APPLICATION D'UN RAPPEL D'OPÉRATEUR
-- =============================================================================
--  Réservée à `service_role` : le navigateur ne doit jamais pouvoir déclarer
--  qu'un paiement a abouti. La fonction est **idempotente** — un rappel rejoué
--  (les opérateurs en renvoient) ne crédite pas deux fois — et refuse de
--  revenir sur un statut déjà final.
create or replace function public.apply_payment_callback(
  p_reference          text,
  p_provider           public.payment_provider,
  p_provider_reference text,
  p_status             public.payment_status,
  p_payload            jsonb   default '{}'::jsonb,
  p_failure_reason     text    default null,
  p_signature_valid    boolean default true
)
returns table (payment_id uuid, applied boolean, resulting_status public.payment_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_event   uuid;
  v_applied boolean := false;
  v_invoice text;
begin
  select * into v_payment from public.payments where reference = p_reference;

  -- Le rappel est consigné même sans paiement correspondant : c'est ainsi
  -- qu'on repère une référence forgée ou un environnement mal aiguillé.
  insert into public.payment_events (
    payment_id, provider, event_type, provider_reference, signature_valid, payload
  )
  values (
    v_payment.id, p_provider, coalesce(p_status::text, 'unknown'),
    p_provider_reference, coalesce(p_signature_valid, true), coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event;

  -- Référence inconnue : on **ne lève pas** d'exception. Elle annulerait la
  -- transaction, donc l'écriture du journal qu'on vient de faire — et c'est
  -- précisément ce rappel-là qu'on veut pouvoir relire après coup. L'appelant
  -- reconnaît le cas à `payment_id` nul.
  if v_payment.id is null then
    return query select null::uuid, false, null::public.payment_status;
    return;
  end if;
  if not coalesce(p_signature_valid, true) then
    return query select v_payment.id, false, v_payment.status;
    return;
  end if;

  -- Statut déjà final : on ne touche à rien, et on le dit.
  if v_payment.status in ('succeeded', 'refunded', 'cancelled') then
    return query select v_payment.id, false, v_payment.status;
    return;
  end if;

  if p_status = 'succeeded' then
    v_invoice := public.next_invoice_number();

    update public.payments
       set status             = 'succeeded',
           provider_reference = coalesce(p_provider_reference, provider_reference),
           paid_at            = coalesce(paid_at, now()),
           invoice_number     = coalesce(invoice_number, v_invoice),
           invoiced_at        = coalesce(invoiced_at, now()),
           metadata           = metadata || coalesce(p_payload, '{}'::jsonb),
           updated_at         = now()
     where id = v_payment.id;
    v_applied := true;

  elsif p_status in ('failed', 'cancelled') then
    update public.payments
       set status             = p_status,
           provider_reference = coalesce(p_provider_reference, provider_reference),
           failure_reason     = left(coalesce(p_failure_reason, 'Paiement non abouti.'), 300),
           metadata           = metadata || coalesce(p_payload, '{}'::jsonb),
           updated_at         = now()
     where id = v_payment.id;
    v_applied := true;

  elsif p_status = 'processing' then
    update public.payments
       set status             = 'processing',
           provider_reference = coalesce(p_provider_reference, provider_reference),
           metadata           = metadata || coalesce(p_payload, '{}'::jsonb),
           updated_at         = now()
     where id = v_payment.id;
    v_applied := true;
  end if;

  -- Mise à jour par clé primaire : l'identifiant a été retenu à l'insertion.
  -- Retrouver « le dernier événement de ce paiement » serait faux dès que deux
  -- rappels arrivent en même temps.
  update public.payment_events e
     set applied = v_applied
   where e.id = v_event;

  return query
    select v_payment.id, v_applied, (select status from public.payments where id = v_payment.id);
end;
$$;

comment on function public.apply_payment_callback is
  'Applique un rappel d''opérateur. Idempotente, refuse de revenir sur un statut final. Réservée à service_role.';

-- =============================================================================
-- 7. FACTURE
-- =============================================================================
--  Une facture n'existe que pour un paiement abouti. La fonction est
--  `security invoker` : la RLS de `payments` fait le travail — le payeur voit
--  la sienne, le staff voit toutes, personne d'autre ne voit rien.
create or replace function public.get_invoice(p_payment_id uuid)
returns table (
  invoice_number text,
  invoiced_at    timestamptz,
  reference      text,
  amount         bigint,
  currency       text,
  purpose        public.payment_purpose,
  provider       public.payment_provider,
  paid_at        timestamptz,
  payer_name     text,
  payer_city     text,
  designation    text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.invoice_number,
    p.invoiced_at,
    p.reference,
    p.amount,
    p.currency,
    p.purpose,
    p.provider,
    p.paid_at,
    u.full_name,
    u.city,
    coalesce(
      p.metadata ->> 'plan_name',
      p.metadata ->> 'feature_plan_name',
      case p.purpose
        when 'subscription' then 'Abonnement'
        when 'ad_feature'   then 'Mise en avant d''une annonce'
        when 'ad_boost'     then 'Remontée d''une annonce'
        when 'verification' then 'Vérification de compte'
        else 'Prestation'
      end
    )
  from public.payments p
  join public.users u on u.id = p.user_id
  where p.id = p_payment_id
    and p.status = 'succeeded';
$$;

-- =============================================================================
-- 8. CONFIRMATION MANUELLE PAR UN ADMINISTRATEUR
-- =============================================================================
--  Tous les règlements ne passent pas par une API : un virement bancaire, un
--  dépôt en espèces ou un transfert Mobile Money fait à la main n'émettent
--  aucun rappel. Sans cette fonction, la plateforme ne pourrait pas encaisser
--  avant d'avoir signé un contrat opérateur — c'est-à-dire pas du tout au
--  démarrage.
--
--  Le pouvoir est réel : cette fonction crédite un abonnement. Il est donc
--  borné — administrateur uniquement, jamais modérateur — et **tracé** : chaque
--  confirmation laisse une ligne dans `payment_events` avec l'identité de son
--  auteur, exactement comme un rappel d'opérateur.
create or replace function public.admin_confirm_payment(
  p_payment_id uuid,
  p_note       text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_invoice text;
  v_actor   uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'Paiement introuvable.' using errcode = 'P0001';
  end if;
  if v_payment.status not in ('pending', 'processing') then
    raise exception 'Ce paiement n''est plus en attente.' using errcode = 'P0001';
  end if;

  v_invoice := public.next_invoice_number();

  update public.payments
     set status         = 'succeeded',
         paid_at        = coalesce(paid_at, now()),
         invoice_number = coalesce(invoice_number, v_invoice),
         invoiced_at    = coalesce(invoiced_at, now()),
         metadata       = metadata || jsonb_build_object(
                            'confirmed_manually', true,
                            'confirmed_by', v_actor,
                            'confirmation_note', left(coalesce(p_note, ''), 300)
                          ),
         updated_at     = now()
   where id = p_payment_id;

  -- Même journal que les rappels d'opérateur : une confirmation manuelle doit
  -- être aussi facile à retrouver qu'un encaissement automatique.
  insert into public.payment_events (
    payment_id, provider, event_type, provider_reference, signature_valid, applied, payload
  )
  values (
    p_payment_id, v_payment.provider, 'manual_confirmation', null, true, true,
    jsonb_build_object('actor_id', v_actor, 'note', left(coalesce(p_note, ''), 300))
  );

  return coalesce(v_payment.invoice_number, v_invoice);
end;
$$;

comment on function public.admin_confirm_payment(uuid, text) is
  'Confirme à la main un règlement hors ligne (virement, espèces). Administrateur uniquement, tracé dans payment_events.';

-- =============================================================================
-- 9. PRIVILÈGES
-- =============================================================================
grant execute on function public.request_subscription(text, public.payment_provider, text)
  to authenticated;
grant execute on function public.cancel_payment(uuid) to authenticated;
grant execute on function public.get_invoice(uuid)    to authenticated;

--  `apply_payment_callback` n'est PAS accordée à `authenticated` : déclarer
--  qu'un paiement a abouti appartient au serveur, qui seul détient la clé
--  `service_role` et vérifie la signature de l'opérateur.
revoke all on function public.apply_payment_callback(
  text, public.payment_provider, text, public.payment_status, jsonb, text, boolean
) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_payment_callback('
         || 'text, public.payment_provider, text, public.payment_status, jsonb, text, boolean'
         || ') to service_role';
  end if;
end $$;

revoke all on function public.next_invoice_number() from public, anon, authenticated;

grant execute on function public.admin_confirm_payment(uuid, text) to authenticated; -- garde interne : is_admin()
