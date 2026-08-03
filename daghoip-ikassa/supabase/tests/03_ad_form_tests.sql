-- =============================================================================
--  Tests du formulaire d'annonce : durée, GPS, mise en avant, contrôle contenu
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

-- Deux comptes : un vendeur, un modérateur.
insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-000000000001', 'vendeur@test.ga',
   '{"full_name":"Marie Ndong","phone":"06 12 34 56"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'moderateur@test.ga',
   '{"full_name":"Staff Test"}'::jsonb);

update public.users set role = 'moderator' where id = 'b0000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- 1. Durée de publication choisie et bornée
-- ---------------------------------------------------------------------------
\echo '--- 1. Expiration ---'

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  -- 30 jours demandés
  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, expires_at)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce trente jours',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456', now() + interval '30 days')
  returning id into v_ad;
  reset role;

  perform pg_temp.check('durée de 30 jours respectée',
    (select expires_at::date = (now() + interval '30 days')::date
       from public.ads where id = v_ad));
end $$;

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  -- Tentative de visibilité quasi illimitée : bornée à 90 jours par la base.
  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, expires_at)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce durée abusive',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456', now() + interval '10 years')
  returning id into v_ad;
  reset role;

  perform pg_temp.check('durée excessive RAMENÉE à 90 jours',
    (select expires_at::date = (now() + interval '90 days')::date
       from public.ads where id = v_ad));
end $$;

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, expires_at)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce durée trop courte',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456', now() + interval '1 hour')
  returning id into v_ad;
  reset role;

  perform pg_temp.check('durée trop courte RELEVÉE à 7 jours',
    (select expires_at::date = (now() + interval '7 days')::date
       from public.ads where id = v_ad));
end $$;

--  Corriger une faute d'orthographe ne doit PAS reconduire la publication :
--  sans cette garantie, éditer son annonce tous les six jours la maintiendrait
--  en ligne indéfiniment, quota et expiration contournés.
do $$
declare v_cat uuid; v_ad uuid; v_before timestamptz;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, expires_at)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce bientot echue',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456', now() + interval '8 days')
  returning id into v_ad;

  select expires_at into v_before from public.ads where id = v_ad;

  update public.ads set title = 'Annonce bientôt échue' where id = v_ad;
  reset role;

  perform pg_temp.check('une simple modification ne prolonge PAS l''annonce',
    (select expires_at = v_before from public.ads where id = v_ad));

  -- Libère le quota du vendeur pour les suites suivantes.
  delete from public.ads where id = v_ad;
end $$;

--  À l'inverse, la maintenance (service_role, sans auth.uid()) doit pouvoir
--  antidater une échéance : c'est ce qui permet à expire_ads() d'être testable
--  et au back-office de corriger une date.
do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce a antidater',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456')
  returning id into v_ad;
  reset role;

  -- Hors session utilisateur : aucune borne appliquée.
  perform set_config('request.jwt.claim.sub', '', true);
  update public.ads set expires_at = now() - interval '1 day' where id = v_ad;

  perform pg_temp.check('la maintenance peut antidater une échéance',
    (select expires_at < now() from public.ads where id = v_ad));

  delete from public.ads where id = v_ad;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Coordonnées GPS
-- ---------------------------------------------------------------------------
\echo '--- 2. Localisation GPS ---'

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, latitude, longitude)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce avec position',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456', 0.4162123456, 9.4673987654)
  returning id into v_ad;
  reset role;

  perform pg_temp.check('coordonnées arrondies à 3 décimales (~110 m)',
    (select latitude = 0.416 and longitude = 9.467 from public.ads where id = v_ad));
end $$;

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  -- Une seule des deux coordonnées : donnée inexploitable, on l'écarte.
  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, latitude)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Annonce coordonnée orpheline',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456', 0.4162)
  returning id into v_ad;
  reset role;

  perform pg_temp.check('coordonnée isolée écartée',
    (select latitude is null and longitude is null from public.ads where id = v_ad));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Validation automatique du contenu
-- ---------------------------------------------------------------------------
\echo '--- 3. Contrôle automatique du contenu ---'

do $$ begin
  perform pg_temp.check('contenu ordinaire non signalé',
    not public.needs_manual_review('Toyota RAV4 2018', 'Véhicule bien entretenu, première main.'));

  perform pg_temp.check('trafic d''ivoire détecté',
    public.needs_manual_review('Belle sculpture', 'Vends ivoire authentique, prix négociable.'));

  perform pg_temp.check('écailles de pangolin détectées',
    public.needs_manual_review('Produit rare', 'Ecailles de pangolin disponibles en quantité.'));

  perform pg_temp.check('détection insensible aux accents',
    public.needs_manual_review('Lot', 'Écailles de pangolin, livraison rapide.'));

  perform pg_temp.check('faux documents détectés',
    public.needs_manual_review('Service express', 'Faux passeport et faux diplome sur commande.'));

  perform pg_temp.check('arme à feu détectée',
    public.needs_manual_review('Matériel', 'Arme a feu en bon état, munitions incluses.'));
end $$;

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, status)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Sculpture traditionnelle',
          'Magnifique piece en ivoire authentique, provenance directe.',
          500000, 'Libreville', '+2416123456', 'published')
  returning id into v_ad;
  reset role;

  perform pg_temp.check('annonce suspecte mise EN ATTENTE, pas publiée',
    (select status = 'pending_review' from public.ads where id = v_ad));
  perform pg_temp.check('annonce suspecte invisible du public',
    (select expires_at is null from public.ads where id = v_ad));
end $$;

do $$
declare v_count integer;
begin
  set local role anon;
  select count(*) into v_count from public.ads where title = 'Sculpture traditionnelle';
  reset role;
  perform pg_temp.check('un visiteur anonyme ne voit pas l''annonce en attente', v_count = 0);
end $$;

-- Le staff n'est pas soumis au filtre automatique.
do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);

  insert into public.ads (seller_id, category_id, title, description, price, city,
                          contact_phone, status)
  values ('b0000000-0000-0000-0000-000000000002', v_cat, 'Documentation sur l''ivoire',
          'Ouvrage documentaire sur le trafic d ivoire, a but pedagogique.',
          15000, 'Libreville', '+2416123456', 'published')
  returning id into v_ad;
  reset role;

  perform pg_temp.check('le staff échappe au filtre automatique',
    (select status = 'published' from public.ads where id = v_ad));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Mise en avant payante
-- ---------------------------------------------------------------------------
\echo '--- 4. Mise en avant ---'

do $$ begin
  perform pg_temp.check('trois offres de mise en avant disponibles',
    (select count(*) = 3 from public.ad_feature_plans where is_active));
end $$;

-- 4a. Un vendeur ne peut pas se mettre en avant tout seul
do $$
declare v_blocked boolean := false; v_ad uuid;
begin
  select id into v_ad from public.ads
   where seller_id = 'b0000000-0000-0000-0000-000000000001' and status = 'published' limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
    update public.ads set is_featured = true where id = v_ad;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('auto-mise en avant REFUSÉE', v_blocked);
end $$;

-- 4b. La demande crée un paiement au tarif du serveur
do $$
declare v_ad uuid; v_payment uuid;
begin
  select id into v_ad from public.ads
   where seller_id = 'b0000000-0000-0000-0000-000000000001' and status = 'published' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
  select public.request_ad_feature(v_ad, 'boost_15', 'airtel_money', '06 12 34 56')
    into v_payment;
  reset role;

  perform pg_temp.check('demande de mise en avant enregistrée', v_payment is not null);
  perform pg_temp.check('montant issu du catalogue serveur (3 500 FCFA)',
    (select amount = 3500 and status = 'pending' from public.payments where id = v_payment));
  perform pg_temp.check('durée de l''offre conservée dans les métadonnées',
    (select (metadata ->> 'duration_days')::int = 15 from public.payments where id = v_payment));
  perform pg_temp.check('l''annonce n''est PAS encore mise en avant',
    (select not is_featured from public.ads where id = v_ad));
end $$;

-- 4c. Deux demandes simultanées sont refusées
do $$
declare v_blocked boolean := false; v_ad uuid;
begin
  select id into v_ad from public.ads
   where seller_id = 'b0000000-0000-0000-0000-000000000001' and status = 'published' limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
    perform public.request_ad_feature(v_ad, 'boost_7');
  exception when raise_exception then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('seconde demande simultanée REFUSÉE', v_blocked);
end $$;

-- 4d. Mise en avant sur l'annonce d'autrui
do $$
declare v_blocked boolean := false; v_ad uuid;
begin
  select id into v_ad from public.ads
   where seller_id = 'b0000000-0000-0000-0000-000000000001' limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
    perform public.request_ad_feature(v_ad, 'boost_7');
  exception when raise_exception then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('mise en avant de l''annonce d''autrui REFUSÉE', v_blocked);
end $$;

-- 4e. Offre inexistante
do $$
declare v_blocked boolean := false; v_ad uuid;
begin
  select id into v_ad from public.ads
   where seller_id = 'b0000000-0000-0000-0000-000000000001' and status = 'published'
   offset 1 limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
    perform public.request_ad_feature(v_ad, 'boost_gratuit_999');
  exception when raise_exception then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('offre inconnue REFUSÉE', v_blocked);
end $$;

-- 4f. Le paiement confirmé applique la durée de l'offre
do $$
declare v_payment uuid; v_ad uuid;
begin
  select id, ad_id into v_payment, v_ad from public.payments
   where purpose = 'ad_feature' and status = 'pending' limit 1;

  update public.payments set status = 'succeeded', paid_at = now() where id = v_payment;

  perform pg_temp.check('annonce mise en avant après paiement',
    (select is_featured from public.ads where id = v_ad));
  perform pg_temp.check('durée appliquée = 15 jours de l''offre payée',
    (select featured_until::date = (now() + interval '15 days')::date
       from public.ads where id = v_ad));
end $$;

\echo ''
\echo '============================================'
\echo '  TESTS FORMULAIRE : TOUS PASSÉS'
\echo '============================================'
