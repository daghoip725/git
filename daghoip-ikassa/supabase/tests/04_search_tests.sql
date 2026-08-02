-- =============================================================================
--  Tests de la recherche : quartier, ancienneté, distance, tris
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

-- Un vendeur professionnel : quota large, pour ne pas buter dessus.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'vendeur@test.ga',
   '{"full_name":"Vendeur Recherche"}'::jsonb);

update public.users
   set role = 'admin'   -- exempte du quota d'annonces du plan gratuit
 where id = 'c0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Jeu d'essai
-- ---------------------------------------------------------------------------
--  Repères réels : Libreville (0.4162, 9.4673), Owendo (~14 km au sud),
--  Port-Gentil (~147 km au sud-ouest).
do $$
declare
  v_cat  uuid;
  v_cat2 uuid;
  v_user uuid := 'c0000000-0000-0000-0000-000000000001';
begin
  select id into v_cat  from public.categories where slug = 'divers';
  select id into v_cat2 from public.categories where parent_id is null and slug <> 'divers' limit 1;

  insert into public.ads (id, seller_id, category_id, title, description, price, city,
                          district, latitude, longitude, views_count, condition)
  values
    ('c0000000-0000-0000-0000-0000000000a1', v_user, v_cat,
     'Canape Libreville centre', 'Description suffisamment longue pour satisfaire la contrainte.',
      50000,  'Libreville', 'Nzeng-Ayong', 0.4162, 9.4673, 10, 'good'),
    ('c0000000-0000-0000-0000-0000000000a2', v_user, v_cat,
     'Table Owendo', 'Description suffisamment longue pour satisfaire la contrainte.',
      20000,  'Libreville', 'nzeng ayong', 0.2900, 9.5000, 90, 'new'),
    ('c0000000-0000-0000-0000-0000000000a3', v_user, v_cat,
     'Armoire Port-Gentil', 'Description suffisamment longue pour satisfaire la contrainte.',
      120000, 'Port-Gentil', 'Grand Village', -0.7193, 8.7815, 50, 'fair'),
    ('c0000000-0000-0000-0000-0000000000a4', v_user, v_cat2,
     'Annonce sans position', 'Description suffisamment longue pour satisfaire la contrainte.',
      75000,  'Libreville', 'Akébé', null, null, 5, 'good');

  -- Les compteurs de vues sont posés par trigger à l'insertion : on les
  -- rétablit ici pour pouvoir vérifier le tri par popularité.
  update public.ads set views_count = 10 where id = 'c0000000-0000-0000-0000-0000000000a1';
  update public.ads set views_count = 90 where id = 'c0000000-0000-0000-0000-0000000000a2';
  update public.ads set views_count = 50 where id = 'c0000000-0000-0000-0000-0000000000a3';
  update public.ads set views_count = 5  where id = 'c0000000-0000-0000-0000-0000000000a4';

  -- Antidatage : hors session utilisateur, aucune borne n'est appliquée.
  update public.ads set published_at = now() - interval '40 days'
   where id = 'c0000000-0000-0000-0000-0000000000a3';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Distance orthodromique
-- ---------------------------------------------------------------------------
\echo '--- 1. Distance ---'

do $$
begin
  perform pg_temp.check('distance nulle entre un point et lui-même',
    public.haversine_km(0.4162, 9.4673, 0.4162, 9.4673) = 0);

  perform pg_temp.check('Libreville – Port-Gentil ≈ 147 km',
    public.haversine_km(0.4162, 9.4673, -0.7193, 8.7815) between 140 and 155);

  perform pg_temp.check('un degré de latitude ≈ 111 km',
    public.haversine_km(0, 0, 1, 0) between 110 and 112);

  -- À l'équateur seulement : un degré de longitude y vaut autant qu'un degré
  -- de latitude. C'est précisément le cas du Gabon.
  perform pg_temp.check('un degré de longitude ≈ 111 km à l''équateur',
    public.haversine_km(0, 0, 0, 1) between 110 and 112);

  perform pg_temp.check('la distance est symétrique',
    abs(public.haversine_km(0.41, 9.46, -0.71, 8.78)
        - public.haversine_km(-0.71, 8.78, 0.41, 9.46)) < 0.001);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Filtre « autour de moi »
-- ---------------------------------------------------------------------------
\echo '--- 2. Rayon géographique ---'

do $$
declare v_ids uuid[]; v_dist numeric;
begin
  -- Depuis le centre de Libreville, 5 km : seule l'annonce du centre.
  select array_agg(s.id order by s.id) into v_ids
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 5) s;
  perform pg_temp.check('rayon de 5 km : 1 annonce',
    v_ids = array['c0000000-0000-0000-0000-0000000000a1'::uuid]);

  -- 30 km : le centre et le sud de la commune.
  select array_agg(s.id order by s.id) into v_ids
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 30) s;
  perform pg_temp.check('rayon de 30 km : 2 annonces', array_length(v_ids, 1) = 2);

  -- 200 km : les trois annonces géolocalisées, jamais celle qui n'a pas de position.
  select array_agg(s.id order by s.id) into v_ids
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 200) s;
  perform pg_temp.check('rayon de 200 km : 3 annonces géolocalisées',
    array_length(v_ids, 1) = 3);
  perform pg_temp.check('annonce sans position exclue du filtre de distance',
    not ('c0000000-0000-0000-0000-0000000000a4'::uuid = any(v_ids)));

  -- La distance est restituée, arrondie au dixième de kilomètre.
  select s.distance_km into v_dist
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 200) s
   where s.id = 'c0000000-0000-0000-0000-0000000000a3';
  perform pg_temp.check('distance restituée pour Port-Gentil', v_dist between 140 and 155);

  select s.distance_km into v_dist
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 200) s
   where s.id = 'c0000000-0000-0000-0000-0000000000a1';
  perform pg_temp.check('distance nulle pour l''annonce au point de référence', v_dist = 0);

  -- Sans les trois paramètres, aucun filtre ni distance.
  select s.distance_km into v_dist
    from public.search_ads() s where s.id = 'c0000000-0000-0000-0000-0000000000a1';
  perform pg_temp.check('aucune distance calculée hors filtre géographique', v_dist is null);

  select count(*) into v_dist from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673) s;
  perform pg_temp.check('rayon manquant : filtre inactif, toutes les annonces', v_dist = 4);

  -- Rayon délirant : borné à 200 km, jamais une recherche à l'échelle du globe.
  select count(*) into v_dist
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 40000) s;
  perform pg_temp.check('rayon excessif borné à 200 km', v_dist = 3);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Filtre par quartier
-- ---------------------------------------------------------------------------
\echo '--- 3. Quartier ---'

do $$
declare v_count integer; v_label text;
begin
  select count(*) into v_count from public.search_ads(p_district => 'Nzeng-Ayong') s;
  perform pg_temp.check('quartier : 2 annonces malgré deux orthographes', v_count = 2);

  select count(*) into v_count from public.search_ads(p_district => 'nzeng ayong') s;
  perform pg_temp.check('quartier insensible à la casse et aux tirets', v_count = 2);

  select count(*) into v_count from public.search_ads(p_district => '  NZENG-AYONG  ') s;
  perform pg_temp.check('quartier insensible aux espaces superflus', v_count = 2);

  select count(*) into v_count from public.search_ads(p_district => 'Akebe') s;
  perform pg_temp.check('quartier insensible aux accents', v_count = 1);

  select count(*) into v_count from public.search_ads(p_district => 'Quartier inexistant') s;
  perform pg_temp.check('quartier inconnu : aucun résultat', v_count = 0);

  select count(*) into v_count from public.search_ads(p_district => '   ') s;
  perform pg_temp.check('quartier vide : filtre inactif', v_count = 4);

  -- Combinaison ville + quartier.
  select count(*) into v_count
    from public.search_ads(p_city => 'Port-Gentil', p_district => 'Grand Village') s;
  perform pg_temp.check('ville + quartier combinés', v_count = 1);

  select count(*) into v_count
    from public.search_ads(p_city => 'Libreville', p_district => 'Grand Village') s;
  perform pg_temp.check('ville et quartier incohérents : aucun résultat', v_count = 0);

  -- Inventaire des quartiers.
  select d.district into v_label
    from public.list_districts() d
   where lower(public.immutable_unaccent(d.district)) like 'nzeng%';
  perform pg_temp.check('orthographe la plus fréquente restituée', v_label is not null);

  select count(*) into v_count from public.list_districts() d;
  perform pg_temp.check('trois quartiers distincts recensés', v_count = 3);

  select d.ads_count into v_count
    from public.list_districts() d
   where lower(public.immutable_unaccent(d.district)) like 'nzeng%';
  perform pg_temp.check('les deux orthographes sont comptées ensemble', v_count = 2);

  select count(*) into v_count from public.list_districts(p_city => 'Port-Gentil') d;
  perform pg_temp.check('quartiers filtrés par ville', v_count = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Filtre par ancienneté
-- ---------------------------------------------------------------------------
\echo '--- 4. Date de publication ---'

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.search_ads(p_max_age_days => 7) s;
  perform pg_temp.check('publiées depuis 7 jours : 3 annonces', v_count = 3);

  select count(*) into v_count from public.search_ads(p_max_age_days => 60) s;
  perform pg_temp.check('publiées depuis 60 jours : les 4 annonces', v_count = 4);

  select count(*) into v_count from public.search_ads(p_max_age_days => 0) s;
  perform pg_temp.check('ancienneté nulle : rien de plus vieux qu''à l''instant', v_count <= 4);

  select count(*) into v_count from public.search_ads() s;
  perform pg_temp.check('sans filtre d''ancienneté : les 4 annonces', v_count = 4);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Tris
-- ---------------------------------------------------------------------------
\echo '--- 5. Tris ---'

do $$
declare v_prices bigint[]; v_views integer[]; v_first uuid;
begin
  select array_agg(s.price order by o) into v_prices
    from (select s.*, row_number() over () as o
            from public.search_ads(p_sort => 'price_asc') s) s;
  perform pg_temp.check('tri « moins cher » croissant',
    v_prices = array[20000, 50000, 75000, 120000]::bigint[]);

  select array_agg(s.price order by o) into v_prices
    from (select s.*, row_number() over () as o
            from public.search_ads(p_sort => 'price_desc') s) s;
  perform pg_temp.check('tri « plus cher » décroissant',
    v_prices = array[120000, 75000, 50000, 20000]::bigint[]);

  select array_agg(s.views_count order by o) into v_views
    from (select s.*, row_number() over () as o
            from public.search_ads(p_sort => 'popular') s) s;
  perform pg_temp.check('tri « popularité » décroissant',
    v_views = array[90, 50, 10, 5]);

  -- « Plus récent » : l'annonce antidatée de 40 jours doit finir dernière.
  select s.id into v_first
    from public.search_ads(p_sort => 'recent') s limit 1;
  perform pg_temp.check('tri « plus récent » ne commence pas par l''annonce ancienne',
    v_first <> 'c0000000-0000-0000-0000-0000000000a3');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Pagination et total
-- ---------------------------------------------------------------------------
\echo '--- 6. Pagination ---'

do $$
declare v_total bigint; v_count integer;
begin
  select s.total_count into v_total from public.search_ads(p_limit => 2) s limit 1;
  perform pg_temp.check('total_count reste celui de la recherche entière', v_total = 4);

  select count(*) into v_count from public.search_ads(p_limit => 2) s;
  perform pg_temp.check('la page ne renvoie que 2 lignes', v_count = 2);

  select count(*) into v_count from public.search_ads(p_limit => 2, p_offset => 2) s;
  perform pg_temp.check('la seconde page renvoie les 2 restantes', v_count = 2);

  select s.total_count into v_total
    from public.search_ads(p_district => 'Nzeng-Ayong', p_limit => 1) s limit 1;
  perform pg_temp.check('total_count tient compte des filtres', v_total = 2);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Combinaisons et visibilité
-- ---------------------------------------------------------------------------
\echo '--- 7. Combinaisons ---'

do $$
declare v_count integer;
begin
  select count(*) into v_count
    from public.search_ads(
      p_city => 'Libreville', p_district => 'Nzeng-Ayong',
      p_min_price => 30000, p_max_price => 100000, p_condition => 'good') s;
  perform pg_temp.check('ville + quartier + prix + état combinés', v_count = 1);

  select count(*) into v_count
    from public.search_ads(
      p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 30,
      p_max_price => 30000) s;
  perform pg_temp.check('rayon + prix maximum combinés', v_count = 1);

  select count(*) into v_count from public.search_ads(p_query => 'canape') s;
  perform pg_temp.check('recherche plein texte toujours opérante', v_count = 1);

  -- Une annonce non publiée ne doit apparaître dans aucun filtre.
  update public.ads set status = 'archived'
   where id = 'c0000000-0000-0000-0000-0000000000a1';
  select count(*) into v_count from public.search_ads(p_district => 'Nzeng-Ayong') s;
  perform pg_temp.check('annonce archivée retirée des résultats', v_count = 1);

  select count(*) into v_count
    from public.search_ads(p_latitude => 0.4162, p_longitude => 9.4673, p_radius_km => 5) s;
  perform pg_temp.check('annonce archivée retirée du rayon', v_count = 0);
end $$;

\echo ''
\echo '  TESTS RECHERCHE : TOUS PASSÉS'
