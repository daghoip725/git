-- =============================================================================
--  Tests du système de paiement : ouverture, rappels, facturation
-- =============================================================================
\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on

create or replace function pg_temp.check(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  OK   %', p_label;
  else
    raise exception 'ECHEC : %', p_label;
  end if;
end $$;

create or replace function pg_temp.fails_as(p_user uuid, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'payeur@test.ga', '{"full_name":"Payeur Test"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000002', 'tiers@test.ga',  '{"full_name":"Tiers Test"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Numéro du payeur
-- ---------------------------------------------------------------------------
\echo '--- 1. Numéro du payeur ---'

do $$
declare v_ok boolean;
begin
  -- Un numéro gabonais en E.164 compte 7 à 9 chiffres après « +241 ».
  begin
    insert into public.payments (user_id, purpose, provider, payer_phone, amount, status)
    values ('f0000000-0000-0000-0000-000000000001', 'other', 'airtel_money',
            '+2416123456', 1000, 'pending');
    v_ok := true;
  exception when check_violation then
    v_ok := false;
  end;
  perform pg_temp.check('numéro à 7 chiffres accepté (le cas courant)', v_ok);

  begin
    insert into public.payments (user_id, purpose, provider, payer_phone, amount, status)
    values ('f0000000-0000-0000-0000-000000000001', 'other', 'airtel_money',
            '+2416123456789', 1000, 'pending');
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform pg_temp.check('numéro à 10 chiffres REFUSÉ', v_ok);

  delete from public.payments where purpose = 'other';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Ouverture d'un paiement d'abonnement
-- ---------------------------------------------------------------------------
\echo '--- 2. Ouverture ---'

do $$
declare v_payment uuid; v_row public.payments; v_plan public.subscription_plans; v_blocked boolean;
begin
  select * into v_plan from public.subscription_plans where price > 0 and is_active
   order by price limit 1;
  perform pg_temp.check('une offre payante existe dans le catalogue', v_plan.id is not null);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  v_payment := public.request_subscription(v_plan.code, 'airtel_money', '06 12 34 56');
  reset role;

  select * into v_row from public.payments where id = v_payment;
  perform pg_temp.check('paiement créé en attente', v_row.status = 'pending');
  perform pg_temp.check('montant issu du catalogue serveur', v_row.amount = v_plan.price);
  perform pg_temp.check('numéro normalisé en E.164', v_row.payer_phone = '+2416123456');
  perform pg_temp.check('référence attribuée', v_row.reference like 'DI-PAY-%');
  perform pg_temp.check('aucune facture avant paiement', v_row.invoice_number is null);

  -- L'abonnement est créé mais n'accorde encore aucun droit.
  perform pg_temp.check('abonnement rattaché, non actif',
    (select status from public.subscriptions where id = v_row.subscription_id) = 'past_due');

  -- Deuxième demande simultanée : refusée.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    format('select public.request_subscription(%L)', v_plan.code));
  reset role;
  perform pg_temp.check('seconde demande simultanée REFUSÉE', v_blocked);

  -- Offre inconnue.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000002',
    'select public.request_subscription(''offre_inexistante'')');
  reset role;
  perform pg_temp.check('offre inconnue REFUSÉE', v_blocked);

  -- Numéro invalide.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000002',
    format('select public.request_subscription(%L, ''moov_money'', ''12345'')', v_plan.code));
  reset role;
  perform pg_temp.check('numéro de payeur invalide REFUSÉ', v_blocked);

  -- Visiteur anonyme.
  set local role anon;
  v_blocked := pg_temp.fails_as(null, format('select public.request_subscription(%L)', v_plan.code));
  reset role;
  perform pg_temp.check('visiteur anonyme REFUSÉ', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Le client ne peut pas se déclarer payé
-- ---------------------------------------------------------------------------
\echo '--- 3. Cloisonnement ---'

do $$
declare v_blocked boolean; v_ref text;
begin
  select reference into v_ref from public.payments where purpose = 'subscription' limit 1;

  -- Écriture directe sur `payments` : aucun droit accordé au client.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    'update public.payments set status = ''succeeded'', paid_at = now()');
  reset role;
  perform pg_temp.check('le payeur ne peut pas se déclarer payé', v_blocked);

  -- La RPC de rappel n'est pas exécutable par un compte authentifié.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    format('select * from public.apply_payment_callback(%L, ''airtel_money'', ''X'', ''succeeded'')', v_ref));
  reset role;
  perform pg_temp.check('apply_payment_callback INACCESSIBLE au client', v_blocked);

  -- Un tiers ne voit pas le paiement d'autrui.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
  perform pg_temp.check('un tiers ne voit AUCUN paiement d''autrui',
    (select count(*) from public.payments) = 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rappel d'opérateur
-- ---------------------------------------------------------------------------
\echo '--- 4. Rappels d''opérateur ---'

do $$
declare
  v_ref     text;
  v_payment public.payments;
  v_result  record;
  v_events  integer;
  v_blocked boolean;
begin
  select reference into v_ref from public.payments where purpose = 'subscription' limit 1;

  -- Signature invalide : consignée, jamais appliquée.
  select * into v_result from public.apply_payment_callback(
    v_ref, 'airtel_money', 'OP-1', 'succeeded', '{}'::jsonb, null, false);
  perform pg_temp.check('signature invalide : rappel NON appliqué', not v_result.applied);
  perform pg_temp.check('le paiement reste en attente', v_result.resulting_status = 'pending');
  perform pg_temp.check('le rappel invalide est tout de même consigné',
    (select count(*) from public.payment_events where not signature_valid) = 1);

  -- Rappel valide : appliqué.
  select * into v_result from public.apply_payment_callback(
    v_ref, 'airtel_money', 'OP-1', 'succeeded',
    '{"operator_status":"TS"}'::jsonb, null, true);
  perform pg_temp.check('rappel valide appliqué', v_result.applied);
  perform pg_temp.check('statut abouti', v_result.resulting_status = 'succeeded');

  select * into v_payment from public.payments where reference = v_ref;
  perform pg_temp.check('date de règlement posée', v_payment.paid_at is not null);
  perform pg_temp.check('référence opérateur conservée', v_payment.provider_reference = 'OP-1');
  perform pg_temp.check('charge utile fusionnée dans les métadonnées',
    v_payment.metadata ->> 'operator_status' = 'TS');
  perform pg_temp.check('numéro de facture attribué',
    v_payment.invoice_number like 'DI-FAC-%');

  -- L'abonnement est devenu actif.
  perform pg_temp.check('abonnement activé par le paiement',
    (select status from public.subscriptions where id = v_payment.subscription_id) = 'active');

  -- Rejeu : les opérateurs renvoient leurs rappels.
  select * into v_result from public.apply_payment_callback(
    v_ref, 'airtel_money', 'OP-1', 'succeeded', '{}'::jsonb, null, true);
  perform pg_temp.check('rejeu du rappel NON appliqué (idempotence)', not v_result.applied);

  perform pg_temp.check('le numéro de facture ne change pas au rejeu',
    (select invoice_number from public.payments where reference = v_ref)
      = v_payment.invoice_number);

  -- Tentative de retour en arrière depuis un statut final.
  select * into v_result from public.apply_payment_callback(
    v_ref, 'airtel_money', 'OP-1', 'failed', '{}'::jsonb, 'Annulé', true);
  perform pg_temp.check('un paiement abouti ne redevient pas échoué', not v_result.applied);
  perform pg_temp.check('statut inchangé',
    (select status from public.payments where reference = v_ref) = 'succeeded');

  -- Référence inconnue : consignée, et signalée par un identifiant nul.
  -- On ne lève pas d'exception, sans quoi le journal serait annulé avec la
  -- transaction — or c'est justement ce rappel-là qu'on veut pouvoir relire.
  select count(*) into v_events from public.payment_events;
  select * into v_result from public.apply_payment_callback(
    'DI-PAY-INEXISTANT', 'moov_money', 'X', 'succeeded', '{}'::jsonb, null, true);
  perform pg_temp.check('référence inconnue NON appliquée', not v_result.applied);
  perform pg_temp.check('référence inconnue signalée par un identifiant nul',
    v_result.payment_id is null);
  perform pg_temp.check('le rappel orphelin est tout de même consigné',
    (select count(*) from public.payment_events) = v_events + 1);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Facturation
-- ---------------------------------------------------------------------------
\echo '--- 5. Facturation ---'

do $$
declare v_a text; v_b text; v_invoice record; v_id uuid; v_count integer;
begin
  v_a := public.next_invoice_number();
  v_b := public.next_invoice_number();
  perform pg_temp.check('les numéros de facture se suivent sans trou',
    right(v_b, 6)::integer = right(v_a, 6)::integer + 1);
  perform pg_temp.check('le numéro porte l''exercice',
    v_a like 'DI-FAC-' || extract(year from now())::text || '-%');

  select id into v_id from public.payments where status = 'succeeded' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  select * into v_invoice from public.get_invoice(v_id);
  reset role;

  perform pg_temp.check('le payeur obtient sa facture', v_invoice.invoice_number is not null);
  perform pg_temp.check('la facture porte le nom du payeur', v_invoice.payer_name = 'Payeur Test');
  perform pg_temp.check('la facture porte une désignation lisible',
    v_invoice.designation is not null and v_invoice.designation <> '');

  -- Un tiers n'obtient rien : la RLS de `payments` s'applique à la fonction.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.get_invoice(v_id);
  reset role;
  perform pg_temp.check('un tiers n''obtient AUCUNE facture', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Annulation par le payeur
-- ---------------------------------------------------------------------------
\echo '--- 6. Annulation ---'

do $$
declare v_plan public.subscription_plans; v_payment uuid; v_blocked boolean; v_done uuid;
begin
  select * into v_plan from public.subscription_plans where price > 0 and is_active
   order by price limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
  v_payment := public.request_subscription(v_plan.code, 'moov_money');
  perform public.cancel_payment(v_payment);
  reset role;

  perform pg_temp.check('paiement annulé par son payeur',
    (select status from public.payments where id = v_payment) = 'cancelled');

  -- Un paiement déjà abouti ne s'annule pas.
  select id into v_done from public.payments where status = 'succeeded' limit 1;
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    format('select public.cancel_payment(%L)', v_done));
  reset role;
  perform pg_temp.check('un paiement abouti ne s''annule pas', v_blocked);

  -- Le paiement d'autrui non plus.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000002',
    format('select public.cancel_payment(%L)', v_done));
  reset role;
  perform pg_temp.check('annulation du paiement d''autrui REFUSÉE', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Confirmation manuelle par un administrateur
-- ---------------------------------------------------------------------------
--  Le règlement hors ligne (virement, espèces) n'émet aucun rappel : sans
--  confirmation manuelle, la plateforme ne pourrait pas encaisser avant de
--  signer un contrat opérateur.
\echo '--- 7. Confirmation manuelle ---'

do $$
declare
  v_plan     public.subscription_plans;
  v_payment  uuid;
  v_invoice  text;
  v_blocked  boolean;
  v_events   integer;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('f0000000-0000-0000-0000-000000000003', 'admin.paie@test.ga',
     '{"full_name":"Admin Paiement"}'::jsonb),
    ('f0000000-0000-0000-0000-000000000004', 'moderateur.paie@test.ga',
     '{"full_name":"Moderateur Paiement"}'::jsonb);

  update public.users set role = 'admin'     where id = 'f0000000-0000-0000-0000-000000000003';
  update public.users set role = 'moderator' where id = 'f0000000-0000-0000-0000-000000000004';

  select * into v_plan from public.subscription_plans where price > 0 and is_active
   order by price limit 1;

  -- Un payeur qui règle par virement : le paiement reste en attente.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  v_payment := public.request_subscription(v_plan.code, 'bank_transfer');
  reset role;

  perform pg_temp.check('paiement hors ligne créé en attente',
    (select status from public.payments where id = v_payment) = 'pending');

  -- Le payeur ne peut évidemment pas se confirmer lui-même.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    format('select public.admin_confirm_payment(%L)', v_payment));
  reset role;
  perform pg_temp.check('le payeur ne peut PAS se confirmer lui-même', v_blocked);

  -- Un modérateur non plus : créditer un abonnement n'est pas de la modération.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000004',
    format('select public.admin_confirm_payment(%L)', v_payment));
  reset role;
  perform pg_temp.check('un modérateur ne peut PAS confirmer un paiement', v_blocked);

  perform pg_temp.check('le paiement est resté en attente',
    (select status from public.payments where id = v_payment) = 'pending');

  -- L'administrateur, lui, peut.
  select count(*) into v_events from public.payment_events;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', true);
  v_invoice := public.admin_confirm_payment(v_payment, 'Virement reçu le 02/08');
  reset role;

  perform pg_temp.check('paiement confirmé par l''administrateur',
    (select status from public.payments where id = v_payment) = 'succeeded');
  perform pg_temp.check('numéro de facture attribué', v_invoice like 'DI-FAC-%');
  perform pg_temp.check('la confirmation est tracée dans le journal',
    (select count(*) from public.payment_events) = v_events + 1);
  perform pg_temp.check('le journal porte l''identité de l''auteur',
    (select payload ->> 'actor_id' from public.payment_events
      order by received_at desc limit 1) = 'f0000000-0000-0000-0000-000000000003');
  perform pg_temp.check('l''abonnement est activé',
    (select s.status from public.subscriptions s
       join public.payments p on p.subscription_id = s.id
      where p.id = v_payment) = 'active');

  -- Deux fois : refusé, le paiement n'est plus en attente.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000003',
    format('select public.admin_confirm_payment(%L)', v_payment));
  reset role;
  perform pg_temp.check('une seconde confirmation est REFUSÉE', v_blocked);
end $$;

\echo ''
\echo '  TESTS PAIEMENT : TOUS PASSÉS'
