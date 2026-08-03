-- =============================================================================
--  Tests des performances d'annonce : vues, contacts, favoris, séries
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
  ('e0000000-0000-0000-0000-000000000001', 'vendeur.stats@test.ga', '{"full_name":"Vendeur Stats"}'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', 'acheteur1@test.ga',     '{"full_name":"Acheteur Un"}'::jsonb),
  ('e0000000-0000-0000-0000-000000000003', 'acheteur2@test.ga',     '{"full_name":"Acheteur Deux"}'::jsonb),
  ('e0000000-0000-0000-0000-000000000004', 'concurrent@test.ga',    '{"full_name":"Concurrent"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Vues et historique quotidien
-- ---------------------------------------------------------------------------
\echo '--- 1. Vues ---'

do $$
declare v_cat uuid; v_ad uuid; v_row record;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('e0000000-0000-0000-0000-000000000001', v_cat, 'Congélateur bahut 200 litres',
          'Fonctionne parfaitement, très peu servi, notice incluse.',
          180000, 'fixed', 'Libreville', 'published')
  returning id into v_ad;

  perform public.increment_ad_views(v_ad);
  perform public.increment_ad_views(v_ad);
  perform public.increment_ad_views(v_ad);

  perform pg_temp.check('le compteur cumulé est incrémenté',
    (select views_count from public.ads where id = v_ad) = 3);

  select * into v_row from public.ad_daily_stats where ad_id = v_ad and day = current_date;
  perform pg_temp.check('la ligne du jour est créée', v_row.ad_id is not null);
  perform pg_temp.check('les vues du jour sont comptées', v_row.views = 3);

  -- Une annonce retirée cesse d'alimenter les deux compteurs.
  update public.ads set status = 'archived' where id = v_ad;
  perform public.increment_ad_views(v_ad);

  perform pg_temp.check('une annonce retirée ne compte plus de vue',
    (select views_count from public.ads where id = v_ad) = 3);
  perform pg_temp.check('ni dans l''historique du jour',
    (select views from public.ad_daily_stats where ad_id = v_ad and day = current_date) = 3);

  update public.ads set status = 'published' where id = v_ad;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Favoris : le solde du jour doit pouvoir redescendre
-- ---------------------------------------------------------------------------
\echo '--- 2. Favoris ---'

do $$
declare v_ad uuid;
begin
  select id into v_ad from public.ads
   where seller_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

  insert into public.favorites (user_id, ad_id)
  values ('e0000000-0000-0000-0000-000000000002', v_ad);
  insert into public.favorites (user_id, ad_id)
  values ('e0000000-0000-0000-0000-000000000003', v_ad);

  perform pg_temp.check('le compteur cumulé de favoris suit',
    (select favorites_count from public.ads where id = v_ad) = 2);
  perform pg_temp.check('les favoris du jour sont comptés',
    (select favorites from public.ad_daily_stats where ad_id = v_ad and day = current_date) = 2);

  -- Retrait : le solde du jour doit redescendre. Sans cela la courbe des
  -- favoris ne ferait que monter, ce qui serait faux.
  delete from public.favorites
   where user_id = 'e0000000-0000-0000-0000-000000000003' and ad_id = v_ad;

  perform pg_temp.check('le compteur cumulé redescend',
    (select favorites_count from public.ads where id = v_ad) = 1);
  perform pg_temp.check('le solde du jour redescend aussi',
    (select favorites from public.ad_daily_stats where ad_id = v_ad and day = current_date) = 1);

  -- Retrait un jour sans ligne : ne doit pas violer la contrainte de positivité.
  delete from public.ad_daily_stats where ad_id = v_ad and day = current_date;
  delete from public.favorites
   where user_id = 'e0000000-0000-0000-0000-000000000002' and ad_id = v_ad;

  perform pg_temp.check('un retrait sans ligne du jour ne casse rien',
    (select favorites from public.ad_daily_stats where ad_id = v_ad and day = current_date) = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Contacts
-- ---------------------------------------------------------------------------
\echo '--- 3. Contacts ---'

do $$
declare v_ad uuid; v_counted boolean; v_count integer;
begin
  select id into v_ad from public.ads
   where seller_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
  v_counted := public.record_ad_contact(v_ad, 'phone');
  reset role;

  perform pg_temp.check('le premier contact est compté', v_counted);
  perform pg_temp.check('le compteur de contacts monte',
    (select contacts_count from public.ads where id = v_ad) = 1);
  perform pg_temp.check('le contact figure dans l''historique du jour',
    (select contacts from public.ad_daily_stats where ad_id = v_ad and day = current_date) = 1);

  -- Le même visiteur qui reclique le même jour ne recompte pas.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
  v_counted := public.record_ad_contact(v_ad, 'whatsapp');
  reset role;

  perform pg_temp.check('un second clic du même visiteur ne recompte pas', not v_counted);
  perform pg_temp.check('le compteur reste à un',
    (select contacts_count from public.ads where id = v_ad) = 1);

  -- Un autre visiteur, si.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', true);
  v_counted := public.record_ad_contact(v_ad, 'whatsapp');
  reset role;
  perform pg_temp.check('un autre visiteur compte pour un contact de plus', v_counted);
  perform pg_temp.check('le compteur passe à deux',
    (select contacts_count from public.ads where id = v_ad) = 2);

  -- Le vendeur qui relit sa propre annonce ne se contacte pas lui-même.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  v_counted := public.record_ad_contact(v_ad, 'phone');
  reset role;
  perform pg_temp.check('le vendeur ne se contacte pas lui-même', not v_counted);

  -- Deux visiteurs anonymes distincts comptent séparément.
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  v_counted := public.record_ad_contact(v_ad, 'phone', 'session-aaa');
  perform pg_temp.check('un visiteur anonyme peut être compté', v_counted);
  v_counted := public.record_ad_contact(v_ad, 'phone', 'session-aaa');
  perform pg_temp.check('le même anonyme ne recompte pas', not v_counted);
  v_counted := public.record_ad_contact(v_ad, 'phone', 'session-bbb');
  perform pg_temp.check('un autre anonyme compte', v_counted);
  reset role;

  -- Annonce inexistante : aucun effet, aucune erreur.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
  v_counted := public.record_ad_contact('00000000-0000-0000-0000-000000000000', 'phone');
  reset role;
  perform pg_temp.check('une annonce inconnue ne compte rien', not v_counted);

  -- Aucune identité n'est conservée : la table ne porte que des empreintes.
  select count(*) into v_count from information_schema.columns
   where table_name = 'ad_contacts' and column_name in ('user_id', 'visitor_id', 'ip');
  perform pg_temp.check('la table de contacts ne stocke AUCUNE identité', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Cloisonnement
-- ---------------------------------------------------------------------------
\echo '--- 4. Cloisonnement ---'

do $$
declare v_ad uuid; v_blocked boolean; v_count integer;
begin
  select id into v_ad from public.ads
   where seller_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

  -- Un concurrent ne consulte pas les performances d'autrui.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000004',
    format('select * from public.ad_performance(%L)', v_ad));
  reset role;
  perform pg_temp.check('les performances d''autrui sont INACCESSIBLES', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000004',
    format('select * from public.ad_daily_series(%L)', v_ad));
  reset role;
  perform pg_temp.check('la série quotidienne d''autrui est INACCESSIBLE', v_blocked);

  -- Les tables brutes sont fermées à tout le monde, vendeur compris.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000001',
    'select count(*) from public.ad_contacts');
  reset role;
  perform pg_temp.check('le journal des contacts est FERMÉ, même au vendeur', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000001',
    'select count(*) from public.ad_daily_stats');
  reset role;
  perform pg_temp.check('les compteurs journaliers bruts sont FERMÉS', v_blocked);

  -- Personne ne gonfle ses propres compteurs.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000001',
    format('update public.ads set views_count = 99999 where id = %L', v_ad));
  reset role;
  perform pg_temp.check('un vendeur ne peut PAS gonfler ses vues', v_blocked);

  /*
   * `contacts_count` est une colonne neuve : elle doit hériter du même régime
   * que `views_count`. Le `grant update` de `ads` énumère les colonnes une à
   * une, donc une colonne ajoutée n'est pas écrivable — mais c'est un
   * comportement qu'on vérifie, pas qu'on suppose. Le jour où quelqu'un
   * réécrira ce `grant` en le complétant « pour faire propre », ce test le
   * dira.
   */
  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000001',
    format('update public.ads set contacts_count = 99999 where id = %L', v_ad));
  reset role;
  perform pg_temp.check('un vendeur ne peut PAS gonfler ses contacts', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('e0000000-0000-0000-0000-000000000001',
    format('select public.bump_daily_stat(%L, 1000)', v_ad));
  reset role;
  perform pg_temp.check('l''écriture directe des compteurs journaliers est REFUSÉE', v_blocked);

  -- Le classement du vendeur ne montre que ses annonces.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
  select count(*) into v_count from public.seller_ad_ranking(50);
  reset role;
  perform pg_temp.check('un vendeur sans annonce a un classement vide', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Performance d'une annonce
-- ---------------------------------------------------------------------------
\echo '--- 5. Performance ---'

do $$
declare v_ad uuid; v_row record;
begin
  select id into v_ad from public.ads
   where seller_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  select * into v_row from public.ad_performance(v_ad);
  reset role;

  perform pg_temp.check('les vues sont remontées', v_row.views = 3);
  perform pg_temp.check('les contacts sont remontés', v_row.contacts = 4);
  perform pg_temp.check('les favoris sont remontés', v_row.favorites = 0);
  -- 4 contacts pour 3 vues : le taux dépasse 100 %, et c'est bien ce qu'il
  -- faut afficher plutôt que de le plafonner en douce. Les vues anonymes ne
  -- passent pas toutes par le compteur, un taux élevé est possible.
  perform pg_temp.check('le taux de contact est calculé',
    v_row.contact_rate > 0);
  perform pg_temp.check('l''ancienneté est calculée', v_row.days_online >= 0);

  /*
   * Division par zéro : une annonce sans vue doit renvoyer 0, pas une erreur.
   *
   * La remise à zéro se fait **hors** du rôle `authenticated` : la section 4
   * vient précisément de vérifier qu'un vendeur ne peut pas écrire ce
   * compteur. Le faire ici échouerait, et à juste titre — c'est le montage du
   * cas de test qui doit passer par le propriétaire, pas la protection qui
   * doit céder.
   */
  update public.ads set views_count = 0 where id = v_ad;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  select * into v_row from public.ad_performance(v_ad);
  reset role;
  perform pg_temp.check('aucune vue : taux à zéro, pas d''erreur', v_row.contact_rate = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Série quotidienne
-- ---------------------------------------------------------------------------
\echo '--- 6. Série ---'

do $$
declare v_ad uuid; v_count integer; v_row record;
begin
  select id into v_ad from public.ads
   where seller_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);

  select count(*) into v_count from public.ad_daily_series(v_ad, 30);
  perform pg_temp.check('la série compte 30 jours, sans trou', v_count = 30);

  select * into v_row from public.ad_daily_series(v_ad, 30) order by day desc limit 1;
  perform pg_temp.check('la série se termine aujourd''hui', v_row.day = current_date);

  /*
   * Un jour sans activité vaut zéro, pas une absence de ligne : une courbe à
   * trous laisserait croire à une interruption de mesure.
   *
   * On vérifie la propriété elle-même — aucun compteur nul, et les 29 jours
   * antérieurs tous à zéro — plutôt qu'un total dépendant de ce qu'ont laissé
   * les sections précédentes. La version initiale comptait les jours à zéro
   * vues en attendant 29 ; la section 2 supprime la ligne du jour pour éprouver
   * le retrait sans ligne, si bien que le compte tombait à 30 et le test
   * échouait sur un couplage entre sections, pas sur un défaut de la série.
   */
  select count(*) into v_count from public.ad_daily_series(v_ad, 30) s
   where s.views is null or s.contacts is null or s.favorites is null;
  perform pg_temp.check('aucun jour manquant dans la série', v_count = 0);

  select count(*) into v_count from public.ad_daily_series(v_ad, 30) s
   where s.day < current_date and s.views = 0 and s.contacts = 0 and s.favorites = 0;
  perform pg_temp.check('les jours sans activité valent zéro', v_count = 29);

  -- Fenêtre bornée dans les deux sens.
  select count(*) into v_count from public.ad_daily_series(v_ad, 1);
  perform pg_temp.check('une fenêtre trop courte est RELEVÉE à 7 jours', v_count = 7);
  select count(*) into v_count from public.ad_daily_series(v_ad, 9999);
  perform pg_temp.check('une fenêtre excessive est RAMENÉE à 180 jours', v_count = 180);

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Tableau de bord du vendeur
-- ---------------------------------------------------------------------------
\echo '--- 7. Tableau de bord ---'

do $$
declare v_row record; v_first record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);

  select * into v_row from public.seller_performance(30);
  perform pg_temp.check('les annonces publiées sont comptées', v_row.ads_published = 1);
  perform pg_temp.check('les contacts totaux sont agrégés', v_row.total_contacts = 4);
  perform pg_temp.check('les contacts de la période sont agrégés', v_row.period_contacts = 4);

  -- Le classement trie par contacts, pas par vues : une annonce très vue et
  -- jamais contactée est un problème, pas un succès.
  select * into v_first from public.seller_ad_ranking(10) limit 1;
  perform pg_temp.check('le classement remonte l''annonce du vendeur',
    v_first.contacts = 4);
  perform pg_temp.check('le classement calcule le taux de contact',
    v_first.contact_rate is not null);

  reset role;

  /*
   * La synthèse est `security definer` : le cloisonnement ne vient plus des
   * droits de table mais du filtre sur `auth.uid()`. Il faut donc le vérifier
   * explicitement — un concurrent ne doit rien voir des chiffres d'autrui.
   */
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
  select * into v_row from public.seller_performance(30);
  reset role;
  perform pg_temp.check('un concurrent ne voit AUCUNE annonce des autres',
    coalesce(v_row.ads_published, 0) = 0);
  perform pg_temp.check('un concurrent ne voit AUCUN contact des autres',
    coalesce(v_row.total_contacts, 0) = 0);
  perform pg_temp.check('ni les contacts de la période',
    coalesce(v_row.period_contacts, 0) = 0);

  -- Un visiteur anonyme n'obtient rien, sans erreur.
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.check('un visiteur anonyme n''a aucun tableau de bord',
    (select count(*) from public.seller_performance(30)) = 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Purge
-- ---------------------------------------------------------------------------
\echo '--- 8. Purge ---'

do $$
declare v_ad uuid; v_purged integer; v_count integer;
begin
  select id into v_ad from public.ads
   where seller_id = 'e0000000-0000-0000-0000-000000000001' limit 1;

  insert into public.ad_daily_stats (ad_id, day, views)
  values (v_ad, current_date - 400, 10);

  update public.ad_contacts set created_at = now() - interval '30 days';

  v_purged := public.purge_ad_stats();
  perform pg_temp.check('les statistiques de plus d''un an sont purgées', v_purged >= 1);

  select count(*) into v_count from public.ad_daily_stats
   where ad_id = v_ad and day = current_date - 400;
  perform pg_temp.check('rien de trop ancien ne subsiste', v_count = 0);

  select count(*) into v_count from public.ad_contacts;
  perform pg_temp.check('les empreintes de dédoublonnage sont purgées', v_count = 0);

  -- Les compteurs cumulés, eux, survivent : ils ne dépendent pas de
  -- l'historique.
  perform pg_temp.check('les compteurs cumulés survivent à la purge',
    (select contacts_count from public.ads where id = v_ad) = 4);
end $$;

\echo ''
\echo '  TESTS PERFORMANCES : TOUS PASSÉS'
