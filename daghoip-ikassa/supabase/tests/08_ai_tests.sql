-- =============================================================================
--  Tests des aides intelligentes : prix, doublons, fraude, recommandations
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
  ('a0000000-0000-0000-0000-000000000001', 'vendeur.ia@test.ga',  '{"full_name":"Vendeur IA"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000002', 'acheteur.ia@test.ga', '{"full_name":"Acheteur IA"}'::jsonb),
  ('a0000000-0000-0000-0000-000000000003', 'staff.ia@test.ga',    '{"full_name":"Staff IA"}'::jsonb);

update public.users set role = 'moderator' where id = 'a0000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1. Suggestion de prix
-- ---------------------------------------------------------------------------
\echo '--- 1. Suggestion de prix ---'

do $$
declare
  v_cat    uuid;
  v_result record;
  v_count  integer;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  -- Échantillon trop mince : on ne suggère rien.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000001', v_cat, 'Téléphone unique en son genre',
          'Un seul exemplaire pour le moment sur la plateforme.', 100000, 'fixed',
          'Libreville', 'published');

  select count(*) into v_count from public.suggest_price(v_cat, 'Libreville');
  perform pg_temp.check('sous 5 comparables, AUCUNE suggestion', v_count = 0);

  -- Neuf annonces de plus : l'échantillon devient exploitable. Déposées au
  -- statut « vendu » — une vente conclue reste une référence de prix, et cela
  -- évite de buter sur le quota d'annonces en ligne du plan gratuit.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  select 'a0000000-0000-0000-0000-000000000001', v_cat,
         'Téléphone occasion numéro ' || g,
         'Bon état général, batterie correcte, vendu avec chargeur.',
         (g * 20000)::bigint, 'fixed', 'Libreville', 'sold'
    from generate_series(1, 9) g;

  select * into v_result from public.suggest_price(v_cat, 'Libreville');
  perform pg_temp.check('suggestion produite au-delà du seuil', v_result.sample_size >= 5);
  perform pg_temp.check('périmètre le plus fin retenu', v_result.scope = 'city');
  -- Prix : 100 000 puis 20 000…180 000. Médiane des dix valeurs = 100 000.
  perform pg_temp.check('médiane exacte', v_result.median = 100000);
  perform pg_temp.check('quartiles ordonnés',
    v_result.p25 <= v_result.median and v_result.median <= v_result.p75);

  -- Une valeur aberrante ne doit pas emporter la médiane, contrairement à une
  -- moyenne : c'est la raison d'être du choix.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000001', v_cat, 'Erreur de saisie manifeste',
          'Le vendeur a tapé trop de zéros dans le champ prix.', 900000000, 'fixed',
          'Libreville', 'sold');

  select * into v_result from public.suggest_price(v_cat, 'Libreville');
  perform pg_temp.check('une saisie à sept zéros n''emporte pas la médiane',
    v_result.median between 90000 and 130000);

  -- Ville sans historique : repli sur un périmètre plus large, et il est dit.
  select * into v_result from public.suggest_price(v_cat, 'Mouila');
  perform pg_temp.check('repli sur un périmètre plus large',
    v_result.scope in ('province', 'national'));

  -- Catégorie inconnue : rien, plutôt qu'un chiffre inventé.
  select count(*) into v_count
    from public.suggest_price('00000000-0000-0000-0000-000000000000', 'Libreville');
  perform pg_temp.check('catégorie inconnue : AUCUNE suggestion', v_count = 0);

  select count(*) into v_count from public.suggest_price(null, 'Libreville');
  perform pg_temp.check('catégorie nulle : AUCUNE suggestion', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Détection des doublons
-- ---------------------------------------------------------------------------
\echo '--- 2. Doublons ---'

do $$
declare
  v_cat       uuid;
  v_other_cat uuid;
  v_source    uuid;
  v_count     integer;
  v_row       record;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;
  select id into v_other_cat from public.categories
   where is_active and id <> v_cat order by position limit 1;

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000001', v_cat,
          'Toyota Corolla 2010 essence climatisée',
          'Véhicule en bon état, entretien à jour, pneus neufs.',
          4500000, 'fixed', 'Libreville', 'published')
  returning id into v_source;

  -- Le même vendeur republie presque à l'identique.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000001', v_cat,
          'Toyota Corolla 2010 essence climatisee',
          'Véhicule en bon état, entretien à jour, pneus neufs.',
          4500000, 'fixed', 'Libreville', 'published');

  -- Un autre compte recopie l'annonce en cassant le prix.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000002', v_cat,
          'Toyota Corolla 2010 essence climatisée',
          'Véhicule en bon état, entretien à jour, pneus neufs.',
          1200000, 'fixed', 'Libreville', 'published');

  -- Même titre mais autre catégorie : hors périmètre.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000002', v_other_cat,
          'Toyota Corolla 2010 essence climatisée',
          'Annonce déposée dans une autre catégorie.',
          4500000, 'fixed', 'Libreville', 'published');

  select count(*) into v_count from public.find_duplicate_ads(v_source);
  perform pg_temp.check('les deux copies de la même catégorie sont trouvées', v_count = 2);

  select * into v_row from public.find_duplicate_ads(v_source) limit 1;
  perform pg_temp.check('le doublon du même vendeur passe en tête', v_row.same_seller);
  perform pg_temp.check('le score de ressemblance est élevé', v_row.title_score > 0.7);

  -- L'annonce source ne se retourne jamais elle-même.
  perform pg_temp.check('l''annonce source est exclue',
    not exists (select 1 from public.find_duplicate_ads(v_source) d where d.id = v_source));

  -- Un titre sans rapport ne remonte pas.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000002', v_cat,
          'Réfrigérateur combiné deux portes',
          'Appareil fonctionnel, froid puissant, peu servi.',
          180000, 'fixed', 'Libreville', 'published');

  perform pg_temp.check('un titre sans rapport ne remonte pas',
    not exists (select 1 from public.find_duplicate_ads(v_source) d
                 where d.title like 'Réfrigérateur%'));

  -- Seuil relevé : seules les copies quasi exactes subsistent.
  select count(*) into v_count from public.find_duplicate_ads(v_source, 0.95);
  perform pg_temp.check('un seuil élevé restreint les candidats', v_count <= 2);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Signaux de fraude
-- ---------------------------------------------------------------------------
\echo '--- 3. Fraude ---'

do $$
declare
  v_cat     uuid;
  v_honest  uuid;
  v_scam    uuid;
  v_blocked boolean;
  v_score   integer;
  v_signals text[];
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000001', v_cat,
          'Téléphone Samsung en bon état',
          'Vendu avec son chargeur. Rencontre possible en ville pour essai.',
          100000, 'fixed', 'Libreville', 'published')
  returning id into v_honest;

  -- L'appât : prix cassé, sortie de la plateforme, acompte exigé.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('a0000000-0000-0000-0000-000000000002', v_cat,
          'Téléphone haut de gamme urgent',
          'Contactez-moi sur WhatsApp au 077 11 22 33. Un acompte est exigé '
          'avant toute remise, envoi par Western Union.',
          9000, 'fixed', 'Libreville', 'published')
  returning id into v_scam;

  -- Le public ne voit pas ces signaux : ils désignent des personnes.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('a0000000-0000-0000-0000-000000000001',
    format('select * from public.ad_fraud_signals(%L)', v_scam));
  reset role;
  perform pg_temp.check('un compte ordinaire n''accède PAS aux signaux', v_blocked);

  set local role anon;
  v_blocked := pg_temp.fails_as(null, format('select * from public.ad_fraud_signals(%L)', v_scam));
  reset role;
  perform pg_temp.check('un visiteur anonyme n''y accède PAS non plus', v_blocked);

  -- Le personnel de modération, lui, y accède.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);

  select array_agg(s.signal) into v_signals from public.ad_fraud_signals(v_scam) s;
  perform pg_temp.check('prix aberrant détecté', 'prix_aberrant' = any(v_signals));
  perform pg_temp.check('sortie de plateforme détectée',
    'contact_hors_plateforme' = any(v_signals));
  perform pg_temp.check('paiement anticipé détecté', 'paiement_anticipe' = any(v_signals));
  perform pg_temp.check('absence de photo détectée', 'sans_photo' = any(v_signals));

  v_score := public.ad_fraud_score(v_scam);
  perform pg_temp.check('le score dépasse le seuil de revue', v_score >= 50);
  perform pg_temp.check('le score reste borné à 100', v_score <= 100);

  -- Une annonce honnête ne doit pas franchir le seuil sur un seul signal.
  perform pg_temp.check('l''annonce honnête reste sous le seuil',
    public.ad_fraud_score(v_honest) < 50);

  -- Chaque signal est justifié : un modérateur doit pouvoir lire pourquoi.
  perform pg_temp.check('chaque signal porte une explication',
    not exists (select 1 from public.ad_fraud_signals(v_scam) s
                 where s.detail is null or s.detail = ''));

  -- La file de travail remonte l'annonce suspecte, pas l'honnête.
  perform pg_temp.check('la file de modération remonte l''annonce suspecte',
    exists (select 1 from public.flagged_ads(50) f where f.id = v_scam));
  perform pg_temp.check('elle ne remonte pas l''annonce honnête',
    not exists (select 1 from public.flagged_ads(50) f where f.id = v_honest));

  reset role;

  -- La file est fermée au public.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('a0000000-0000-0000-0000-000000000001',
    'select * from public.flagged_ads(40)');
  reset role;
  perform pg_temp.check('la file de modération est FERMÉE au public', v_blocked);

  -- Aucune annonce n'a été modifiée : ces fonctions suggèrent, elles ne
  -- décident pas.
  perform pg_temp.check('aucune annonce n''a été masquée par la détection',
    (select status from public.ads where id = v_scam) = 'published');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Recommandations
-- ---------------------------------------------------------------------------
\echo '--- 4. Recommandations ---'

do $$
declare
  v_cat      uuid;
  v_fav_ad   uuid;
  v_count    integer;
  v_reason   text;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  select id into v_fav_ad from public.ads
   where seller_id = 'a0000000-0000-0000-0000-000000000001'
     and status = 'published'
   limit 1;

  -- Visiteur anonyme : rien de personnalisé, et surtout aucun profilage.
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*), min(r.reason) into v_count, v_reason from public.recommend_ads(5) r;
  reset role;
  perform pg_temp.check('un visiteur anonyme reçoit des annonces populaires',
    v_count > 0 and v_reason = 'populaire');

  -- Utilisateur avec un favori : recommandations par affinité.
  insert into public.favorites (user_id, ad_id)
  values ('a0000000-0000-0000-0000-000000000002', v_fav_ad);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  select count(*), min(r.reason) into v_count, v_reason from public.recommend_ads(10) r;

  perform pg_temp.check('des recommandations par affinité sont produites',
    v_count > 0 and v_reason = 'affinite');

  -- Ce qui est déjà en favori n'est pas reproposé.
  perform pg_temp.check('l''annonce déjà en favori n''est pas reproposée',
    not exists (select 1 from public.recommend_ads(48) r where r.id = v_fav_ad));

  -- On ne recommande pas à quelqu'un ses propres annonces.
  perform pg_temp.check('ses propres annonces ne sont pas recommandées',
    not exists (
      select 1 from public.recommend_ads(48) r
        join public.ads a on a.id = r.id
       where a.seller_id = 'a0000000-0000-0000-0000-000000000002'
    ));

  -- Seules des annonces en ligne sont recommandées.
  perform pg_temp.check('seules des annonces publiées sont recommandées',
    not exists (
      select 1 from public.recommend_ads(48) r
        join public.ads a on a.id = r.id
       where a.status <> 'published'
    ));

  reset role;

  -- La limite est bornée : un client ne peut pas demander la table entière.
  set local role authenticated;
  select count(*) into v_count from public.recommend_ads(10000);
  reset role;
  perform pg_temp.check('la limite demandée est bornée', v_count <= 48);
end $$;

\echo ''
\echo '  TESTS IA : TOUS PASSÉS'
