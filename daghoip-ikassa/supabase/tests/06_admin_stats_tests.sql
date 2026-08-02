-- =============================================================================
--  Tests des statistiques d'administration
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

-- Un administrateur, un utilisateur ordinaire.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'admin@test.ga',   '{"full_name":"Admin Test"}'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', 'membre@test.ga',  '{"full_name":"Membre Test"}'::jsonb);

update public.users set role = 'admin' where id = 'e0000000-0000-0000-0000-000000000001';

-- Jeu d'essai : annonces réparties dans le temps, un paiement abouti.
do $$
declare v_cat uuid; v_cat2 uuid;
begin
  select id into v_cat  from public.categories where slug = 'divers';
  select id into v_cat2 from public.categories where parent_id is null and slug <> 'divers' limit 1;

  insert into public.ads (id, seller_id, category_id, title, description, price, city, contact_phone)
  values
    ('e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-000000000001', v_cat,
     'Annonce du jour', 'Description suffisamment longue pour satisfaire la contrainte.',
     10000, 'Libreville', '+2416123456'),
    ('e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-000000000001', v_cat,
     'Seconde annonce', 'Description suffisamment longue pour satisfaire la contrainte.',
     20000, 'Libreville', '+2416123456'),
    ('e0000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-000000000001', v_cat2,
     'Annonce ancienne', 'Description suffisamment longue pour satisfaire la contrainte.',
     30000, 'Port-Gentil', '+2416123456');

  -- L'ancienneté se pose à l'INSERT : `ads_before_write` fige `created_at` à
  -- l'UPDATE, une antidatation après coup serait silencieusement ignorée.
  insert into public.ads (id, seller_id, category_id, title, description, price, city,
                          contact_phone, created_at)
  values ('e0000000-0000-0000-0000-0000000000a4', 'e0000000-0000-0000-0000-000000000001', v_cat2,
          'Annonce de la semaine derniere',
          'Description suffisamment longue pour satisfaire la contrainte.',
          40000, 'Port-Gentil', '+2416123456', now() - interval '5 days');

  insert into public.payments (user_id, amount, currency, provider, purpose, status, paid_at)
  values ('e0000000-0000-0000-0000-000000000001', 5000, 'XAF', 'airtel_money',
          'ad_feature', 'succeeded', now());
end $$;

-- ---------------------------------------------------------------------------
-- 1. Contrôle d'accès
-- ---------------------------------------------------------------------------
\echo '--- 1. Accès ---'

do $$
declare v_blocked boolean;
begin
  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000002',
    'select * from public.admin_kpis()');
  reset role;
  perform pg_temp.check('un membre ordinaire ne lit PAS les indicateurs', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000002',
    'select * from public.admin_daily_stats(30)');
  reset role;
  perform pg_temp.check('un membre ordinaire ne lit PAS la série quotidienne', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000002',
    'select * from public.admin_ad_distribution()');
  reset role;
  perform pg_temp.check('un membre ordinaire ne lit PAS les répartitions', v_blocked);

  set local role anon;
  v_blocked := pg_temp.fails_as(null, 'select * from public.admin_kpis()');
  reset role;
  perform pg_temp.check('un visiteur anonyme est REFUSÉ', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Indicateurs
-- ---------------------------------------------------------------------------
\echo '--- 2. Indicateurs ---'

do $$
declare k record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  select * into k from public.admin_kpis();
  reset role;

  perform pg_temp.check('comptes recensés', k.total_users >= 2);
  perform pg_temp.check('quatre annonces au total', k.total_ads = 4);
  perform pg_temp.check('quatre annonces publiées', k.published_ads = 4);
  perform pg_temp.check('quatre annonces créées ces 30 jours', k.new_ads_30d = 4);
  perform pg_temp.check('un membre de l''équipe', k.staff_users = 1);
  perform pg_temp.check('recette des 30 jours = 5 000', k.revenue_30d = 5000);
  perform pg_temp.check('recette totale = 5 000', k.revenue_total = 5000);
  perform pg_temp.check('aucun signalement ouvert', k.open_reports = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Série quotidienne
-- ---------------------------------------------------------------------------
\echo '--- 3. Série quotidienne ---'

do $$
declare v_count integer; v_today record; v_sum bigint;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);

  select count(*) into v_count from public.admin_daily_stats(30);
  perform pg_temp.check('30 jours renvoyés, jours creux compris', v_count = 30);

  select count(*) into v_count from public.admin_daily_stats(7);
  perform pg_temp.check('fenêtre de 7 jours respectée', v_count = 7);

  -- Bornes : 1 jour est relevé à 7, 9999 est ramené à 180.
  select count(*) into v_count from public.admin_daily_stats(1);
  perform pg_temp.check('fenêtre trop courte RELEVÉE à 7 jours', v_count = 7);
  select count(*) into v_count from public.admin_daily_stats(9999);
  perform pg_temp.check('fenêtre excessive RAMENÉE à 180 jours', v_count = 180);

  select * into v_today from public.admin_daily_stats(30) where day = current_date;
  perform pg_temp.check('trois annonces créées aujourd''hui', v_today.new_ads = 3);
  perform pg_temp.check('recette du jour = 5 000', v_today.revenue = 5000);

  select sum(s.new_ads) into v_sum from public.admin_daily_stats(30) s;
  perform pg_temp.check('la somme de la série égale le total sur la période', v_sum = 4);

  select s.new_ads into v_count from public.admin_daily_stats(30) s
   where s.day = current_date - 5;
  perform pg_temp.check('l''annonce antidatée est comptée au bon jour', v_count = 1);

  -- La série est ordonnée et se termine aujourd'hui.
  select s.day into v_today from public.admin_daily_stats(30) s order by s.day desc limit 1;
  perform pg_temp.check('la série se termine aujourd''hui', v_today.day = current_date);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Répartitions
-- ---------------------------------------------------------------------------
\echo '--- 4. Répartitions ---'

do $$
declare v_count integer; v_total bigint; v_label text; v_blocked boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);

  select sum(d.total) into v_total from public.admin_ad_distribution('category') d;
  perform pg_temp.check('répartition par catégorie : 4 annonces', v_total = 4);

  select d.label, d.total into v_label, v_total
    from public.admin_ad_distribution('city') d order by d.total desc limit 1;
  perform pg_temp.check('deux villes ex æquo, ordre alphabétique départage',
    v_label = 'Libreville' and v_total = 2);

  select count(*) into v_count from public.admin_ad_distribution('city') d;
  perform pg_temp.check('deux villes distinctes', v_count = 2);

  select sum(d.total) into v_total from public.admin_ad_distribution('status') d;
  perform pg_temp.check('répartition par statut : 4 annonces', v_total = 4);

  select count(*) into v_count from public.admin_ad_distribution('category', 1) d;
  perform pg_temp.check('limite respectée', v_count = 1);
  reset role;

  -- Une dimension inconnue est refusée, jamais interpolée.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000001',
    'select * from public.admin_ad_distribution(''; drop table public.ads; --'')');
  reset role;
  perform pg_temp.check('dimension inconnue REFUSÉE', v_blocked);

  perform pg_temp.check('la table ads est intacte',
    (select count(*) from public.ads) = 4);
end $$;

\echo ''
\echo '  TESTS STATISTIQUES : TOUS PASSÉS'
