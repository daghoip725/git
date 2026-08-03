-- =============================================================================
--  Tests des historiques : recherches, annonces consultées, cloisonnement
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
  ('c0000000-0000-0000-0000-000000000001', 'visiteur@test.ga', '{"full_name":"Visiteur Test"}'::jsonb),
  ('c0000000-0000-0000-0000-000000000002', 'vendeur.hist@test.ga', '{"full_name":"Vendeur Hist"}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'admin.hist@test.ga', '{"full_name":"Admin Hist"}'::jsonb);

update public.users set role = 'admin' where id = 'c0000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1. Historique des recherches
-- ---------------------------------------------------------------------------
\echo '--- 1. Recherches ---'

do $$
declare v_count integer; v_row record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);

  perform public.record_search('Toyota Corolla', '{"ville":"Libreville"}'::jsonb, 12);
  select count(*) into v_count from public.recent_searches(30);
  perform pg_temp.check('la recherche est enregistrée', v_count = 1);

  select * into v_row from public.recent_searches(30) limit 1;
  perform pg_temp.check('le texte saisi est conservé tel quel', v_row.query = 'Toyota Corolla');
  perform pg_temp.check('les filtres sont conservés', v_row.filters ->> 'ville' = 'Libreville');
  perform pg_temp.check('le nombre de résultats est conservé', v_row.results_count = 12);

  -- La même recherche écrite autrement ne crée pas de doublon : elle remonte.
  perform public.record_search('TOYOTA   corolla', '{"ville":"Akanda"}'::jsonb, 4);
  select count(*) into v_count from public.recent_searches(30);
  perform pg_temp.check('une casse ou un espacement différent ne duplique pas', v_count = 1);

  select * into v_row from public.recent_searches(30) limit 1;
  perform pg_temp.check('la relance met à jour les filtres',
    v_row.filters ->> 'ville' = 'Akanda');

  -- Les accents ne comptent pas non plus.
  perform public.record_search('Réfrigérateur', '{}'::jsonb, 3);
  perform public.record_search('refrigerateur', '{}'::jsonb, 3);
  select count(*) into v_count from public.recent_searches(30);
  perform pg_temp.check('les accents ne créent pas de doublon', v_count = 2);

  -- Saisies inexploitables : ignorées sans erreur.
  perform public.record_search('', '{}'::jsonb, 0);
  perform public.record_search('   ', '{}'::jsonb, 0);
  perform public.record_search('a', '{}'::jsonb, 0);
  select count(*) into v_count from public.recent_searches(30);
  perform pg_temp.check('les saisies vides ou d''un caractère sont ignorées', v_count = 2);

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Plafond de l'historique
-- ---------------------------------------------------------------------------
\echo '--- 2. Plafond ---'

do $$
declare v_count integer; v_oldest boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);

  -- Trente-cinq recherches distinctes : le plafond est de trente.
  for i in 1..35 loop
    perform public.record_search('recherche numero ' || i, '{}'::jsonb, i);
  end loop;

  select count(*) into v_count from public.search_history
   where user_id = 'c0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('l''historique est plafonné à 30 entrées', v_count = 30);

  -- Ce sont bien les plus anciennes qui partent.
  select exists (
    select 1 from public.search_history
     where user_id = 'c0000000-0000-0000-0000-000000000001'
       and query = 'recherche numero 35'
  ) into v_oldest;
  perform pg_temp.check('la plus récente est conservée', v_oldest);

  select exists (
    select 1 from public.search_history
     where user_id = 'c0000000-0000-0000-0000-000000000001'
       and query = 'Toyota Corolla'
  ) into v_oldest;
  perform pg_temp.check('la plus ancienne a été évincée', not v_oldest);

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Annonces consultées
-- ---------------------------------------------------------------------------
\echo '--- 3. Consultations ---'

do $$
declare
  v_cat   uuid;
  v_ad    uuid;
  v_other uuid;
  v_row   record;
  v_count integer;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('c0000000-0000-0000-0000-000000000002', v_cat, 'Vélo tout terrain',
          'Vélo en bon état, freins révisés, pneus neufs.',
          85000, 'fixed', 'Libreville', 'published')
  returning id into v_ad;

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('c0000000-0000-0000-0000-000000000002', v_cat, 'Machine à laver 7 kg',
          'Fonctionne parfaitement, quelques rayures sur le côté.',
          120000, 'fixed', 'Libreville', 'published')
  returning id into v_other;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);

  perform public.record_ad_view(v_ad);
  select count(*) into v_count from public.recent_ad_views(50);
  perform pg_temp.check('la consultation est enregistrée', v_count = 1);

  select * into v_row from public.recent_ad_views(50) limit 1;
  perform pg_temp.check('l''annonce consultée est restituée', v_row.id = v_ad);
  perform pg_temp.check('le titre est joint', v_row.title = 'Vélo tout terrain');
  perform pg_temp.check('la première visite compte pour une', v_row.view_count = 1);

  -- Revoir la même annonce ne crée pas de doublon, mais incrémente.
  perform public.record_ad_view(v_ad);
  select count(*) into v_count from public.recent_ad_views(50);
  perform pg_temp.check('revoir une annonce ne la duplique pas', v_count = 1);

  select * into v_row from public.recent_ad_views(50) limit 1;
  perform pg_temp.check('le nombre de visites augmente', v_row.view_count = 2);

  -- La plus récemment vue passe en tête.
  perform public.record_ad_view(v_other);
  select * into v_row from public.recent_ad_views(50) limit 1;
  perform pg_temp.check('la dernière consultée passe en tête', v_row.id = v_other);

  reset role;

  -- Le vendeur ne s'ajoute pas lui-même en relisant son annonce.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
  perform public.record_ad_view(v_ad);
  select count(*) into v_count from public.ad_views
   where user_id = 'c0000000-0000-0000-0000-000000000002';
  reset role;
  perform pg_temp.check('le vendeur n''entre pas dans son propre historique', v_count = 0);

  -- Une annonce retirée sort de l'historique sans qu'on ait à la filtrer.
  update public.ads set status = 'archived' where id = v_other;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
  select count(*) into v_count from public.recent_ad_views(50);
  reset role;
  perform pg_temp.check('une annonce retirée disparaît de l''historique', v_count = 1);

  -- Le compteur public reste intact : les deux mécaniques sont séparées.
  perform pg_temp.check('le compteur public n''est pas touché par l''historique',
    (select views_count from public.ads where id = v_ad) = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Cloisonnement — c'est le cœur du sujet
-- ---------------------------------------------------------------------------
\echo '--- 4. Cloisonnement ---'

do $$
declare v_count integer; v_blocked boolean;
begin
  -- Un tiers ne voit rien.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.search_history;
  perform pg_temp.check('un tiers ne voit AUCUNE recherche d''autrui', v_count = 0);
  select count(*) into v_count from public.ad_views;
  perform pg_temp.check('un tiers ne voit AUCUNE consultation d''autrui', v_count = 0);
  reset role;

  -- Un administrateur non plus : c'est la seule table du projet sans exception
  -- pour le personnel, et c'est délibéré.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', true);
  select count(*) into v_count from public.search_history;
  perform pg_temp.check('un ADMINISTRATEUR ne voit aucune recherche d''autrui', v_count = 0);
  select count(*) into v_count from public.ad_views;
  perform pg_temp.check('un ADMINISTRATEUR ne voit aucune consultation d''autrui', v_count = 0);
  reset role;

  -- Un visiteur anonyme non plus.
  set local role anon;
  v_blocked := pg_temp.fails_as(null, 'select count(*) from public.search_history');
  reset role;
  perform pg_temp.check('un visiteur anonyme n''accède pas aux recherches', v_blocked);

  -- Écriture directe interdite : elle passe par les RPC, qui plafonnent.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('c0000000-0000-0000-0000-000000000001',
    'insert into public.search_history (user_id, query, query_key) values (auth.uid(), ''x'', ''x'')');
  reset role;
  perform pg_temp.check('l''écriture directe dans l''historique est REFUSÉE', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('c0000000-0000-0000-0000-000000000001',
    'insert into public.ad_views (user_id, ad_id) select auth.uid(), id from public.ads limit 1');
  reset role;
  perform pg_temp.check('l''écriture directe dans les consultations est REFUSÉE', v_blocked);

  -- Un visiteur anonyme qui appelle les RPC : sans effet, sans erreur.
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.record_search('anonyme', '{}'::jsonb, 1);
  reset role;
  perform pg_temp.check('un visiteur anonyme n''écrit rien, et sans erreur',
    (select count(*) from public.search_history where query = 'anonyme') = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Effacement
-- ---------------------------------------------------------------------------
\echo '--- 5. Effacement ---'

do $$
declare v_id uuid; v_count integer; v_erased integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);

  -- Suppression ligne à ligne.
  select id into v_id from public.search_history limit 1;
  delete from public.search_history where id = v_id;
  perform pg_temp.check('une entrée peut être supprimée à l''unité',
    not exists (select 1 from public.search_history where id = v_id));

  -- Tout effacer, en un geste.
  v_erased := public.clear_search_history();
  perform pg_temp.check('tout l''historique de recherche s''efface', v_erased > 0);
  select count(*) into v_count from public.recent_searches(30);
  perform pg_temp.check('plus aucune recherche', v_count = 0);

  v_erased := public.clear_ad_views();
  perform pg_temp.check('tout l''historique de consultation s''efface', v_erased > 0);
  select count(*) into v_count from public.recent_ad_views(50);
  perform pg_temp.check('plus aucune consultation', v_count = 0);

  -- Effacer un historique vide ne lève pas d'erreur.
  perform pg_temp.check('effacer deux fois ne pose pas de problème',
    public.clear_search_history() = 0);

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Effacement par autrui, et conservation bornée
-- ---------------------------------------------------------------------------
\echo '--- 6. Conservation ---'

do $$
declare v_count integer; v_purged integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
  perform public.record_search('recherche a garder', '{}'::jsonb, 1);
  reset role;

  -- Un tiers ne peut pas effacer l'historique d'autrui : la politique DELETE
  -- filtre sur `auth.uid()`, la requête ne supprime donc rien.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
  perform public.clear_search_history();
  reset role;

  perform pg_temp.check('un tiers n''efface pas l''historique d''autrui',
    exists (select 1 from public.search_history where query = 'recherche a garder'));

  -- Purge par ancienneté.
  update public.search_history set created_at = now() - interval '100 days';
  v_purged := public.purge_history();
  perform pg_temp.check('les entrées de plus de 90 jours sont purgées', v_purged >= 1);

  select count(*) into v_count from public.search_history;
  perform pg_temp.check('rien de trop ancien ne subsiste', v_count = 0);
end $$;

\echo ''
\echo '  TESTS HISTORIQUES : TOUS PASSÉS'
