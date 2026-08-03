-- =============================================================================
--  Suite de tests fonctionnels et de sécurité — Daghoip Ikassa
-- =============================================================================
\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on

-- Helper d'assertion
create or replace function pg_temp.check(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  OK   %', p_label;
  else
    raise exception 'ECHEC : %', p_label;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Préparation : trois comptes
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'vendeur@test.ga',
     '{"full_name":"Marie Ndong","phone":"06 12 34 56","city":"Libreville"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'acheteur@test.ga',
     '{"full_name":"Paul Obame","city":"Port-Gentil"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'intrus@test.ga',
     '{"full_name":"Intrus Malveillant"}'::jsonb);

do $$ begin perform pg_temp.check(
  'trigger handle_new_user : 3 profils créés automatiquement',
  (select count(*) from public.users) = 3
); end $$;

-- Le téléphone saisi au format local est stocké en E.164 par le trigger :
-- « 06 12 34 56 » → « +2416123456 » (zéro national retiré).
do $$ begin perform pg_temp.check(
  'métadonnées propagées (nom + téléphone normalisé en E.164)',
  (select full_name = 'Marie Ndong' and phone = '+2416123456'
     from public.users where id = '11111111-1111-1111-1111-111111111111')
); end $$;

-- ---------------------------------------------------------------------------
-- 1. Publication d'une annonce (rôle authenticated)
-- ---------------------------------------------------------------------------
\echo '--- 1. Annonces ---'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.ads (seller_id, category_id, title, description, price, city, contact_phone)
select '11111111-1111-1111-1111-111111111111', id,
       'Toyota RAV4 2018 très bon état',
       'Véhicule bien entretenu, climatisation, première main. Visible à Libreville.',
       12500000, 'Libreville', '+2416123456'
  from public.categories where slug = 'vehicules';

do $$ begin perform pg_temp.check(
  'référence auto-générée (8 caractères)',
  (select reference ~ '^[A-Z0-9]{8}$' from public.ads limit 1)
); end $$;

do $$ begin perform pg_temp.check(
  'slug dérivé et désaccentué',
  (select slug = 'toyota-rav4-2018-tres-bon-etat' from public.ads limit 1)
); end $$;

do $$ begin perform pg_temp.check(
  'published_at et expires_at posés par la base (60 jours)',
  (select published_at is not null
      and expires_at::date = (now() + interval '60 days')::date
     from public.ads limit 1)
); end $$;

do $$ begin perform pg_temp.check(
  'search_vector alimenté',
  (select search_vector is not null from public.ads limit 1)
); end $$;
commit;

do $$ begin perform pg_temp.check(
  'compteur categories.ads_count incrémenté par trigger',
  (select ads_count = 1 from public.categories where slug = 'vehicules')
); end $$;

do $$ begin perform pg_temp.check(
  'compteur users.ads_count incrémenté par trigger',
  (select ads_count = 1 from public.users where id = '11111111-1111-1111-1111-111111111111')
); end $$;

-- ---------------------------------------------------------------------------
-- 2. SÉCURITÉ : tentatives d'élévation de privilège
-- ---------------------------------------------------------------------------
\echo '--- 2. Sécurité : élévation de privilège ---'

-- 2a. S'auto-promouvoir administrateur
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    update public.users set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('auto-promotion en admin REFUSÉE (privilège de colonne)', v_blocked);
end $$;

-- 2b. S'auto-attribuer le badge vérifié
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    update public.users set is_verified = true where id = '33333333-3333-3333-3333-333333333333';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('auto-attribution du badge vérifié REFUSÉE', v_blocked);
end $$;

-- 2c. S'offrir la mise en avant
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    update public.ads set is_featured = true;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('auto-mise en avant d''une annonce REFUSÉE', v_blocked);
end $$;

-- 2d. Gonfler son compteur de vues
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    update public.ads set views_count = 999999;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('falsification du compteur de vues REFUSÉE', v_blocked);
end $$;

-- 2e. Modifier l'annonce d'autrui (RLS)
do $$
declare v_rows integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  update public.ads set title = 'Annonce détournée par un tiers';
  get diagnostics v_rows = row_count;
  reset role;
  perform pg_temp.check('modification de l''annonce d''autrui BLOQUÉE par la RLS', v_rows = 0);
end $$;

-- 2f. Supprimer l'annonce d'autrui
do $$
declare v_rows integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  delete from public.ads;
  get diagnostics v_rows = row_count;
  reset role;
  perform pg_temp.check('suppression de l''annonce d''autrui BLOQUÉE par la RLS', v_rows = 0);
end $$;

-- 2g. Confidentialité du téléphone : invisible pour un tiers
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    perform phone from public.users where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('lecture du téléphone d''autrui REFUSÉE (privilège de colonne)', v_blocked);
end $$;

-- 2h. Le propriétaire lit bien son propre téléphone via la RPC
do $$
declare v_phone text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select (public.get_my_profile()).phone into v_phone;
  reset role;
  perform pg_temp.check('get_my_profile() rend son téléphone au propriétaire',
                        v_phone = '+2416123456');
end $$;

-- 2i. Écriture directe d'un paiement (fraude évidente)
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    insert into public.payments (user_id, purpose, provider, amount, status)
    values ('33333333-3333-3333-3333-333333333333', 'subscription', 'airtel_money', 1, 'succeeded');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('création d''un paiement depuis le client REFUSÉE', v_blocked);
end $$;

-- 2j. Fabrication d'une notification pour autrui (hameçonnage)
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    insert into public.notifications (user_id, type, title)
    values ('11111111-1111-1111-1111-111111111111', 'system', 'Cliquez ici pour gagner');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('injection de notification chez autrui REFUSÉE', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Visibilité anonyme
-- ---------------------------------------------------------------------------
\echo '--- 3. Visibilité publique ---'
do $$
declare v_count integer;
begin
  set local role anon;
  select count(*) into v_count from public.ads;
  reset role;
  perform pg_temp.check('un visiteur anonyme voit l''annonce publiée', v_count = 1);
end $$;

-- Un brouillon reste privé
insert into public.ads (seller_id, category_id, title, description, price, city, contact_phone, status)
select '11111111-1111-1111-1111-111111111111', id, 'Brouillon non publié',
       'Description du brouillon, suffisamment longue pour la contrainte.',
       50000, 'Libreville', '+2416123456', 'draft'
  from public.categories where slug = 'divers';

do $$
declare v_count integer;
begin
  set local role anon;
  select count(*) into v_count from public.ads;
  reset role;
  perform pg_temp.check('le brouillon reste invisible pour l''anonyme', v_count = 1);
end $$;

do $$
declare v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select count(*) into v_count from public.ads;
  reset role;
  perform pg_temp.check('le vendeur voit ses 2 annonces (brouillon compris)', v_count = 2);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Recherche (RPC search_ads)
-- ---------------------------------------------------------------------------
\echo '--- 4. Recherche ---'
do $$
declare v_count integer; v_total bigint;
begin
  set local role anon;
  select count(*), max(total_count) into v_count, v_total
    from public.search_ads(p_query => 'toyota');
  reset role;
  perform pg_temp.check('search_ads trouve « toyota »', v_count = 1 and v_total = 1);
end $$;

do $$
declare v_count integer;
begin
  set local role anon;
  -- Requête accentuée sur un contenu désaccentué.
  select count(*) into v_count from public.search_ads(p_query => 'véhicule entretenu');
  reset role;
  perform pg_temp.check('recherche insensible aux accents', v_count = 1);
end $$;

do $$
declare v_cover text;
begin
  set local role anon;
  select cover_image_path into v_cover from public.search_ads(p_query => 'toyota');
  reset role;
  perform pg_temp.check('search_ads renvoie la colonne image de couverture', v_cover is null);
end $$;

do $$
declare v_count integer;
begin
  set local role anon;
  select count(*) into v_count
    from public.search_ads(p_category_slug => 'vehicules', p_city => 'Libreville',
                           p_min_price => 1000000, p_max_price => 20000000);
  reset role;
  perform pg_temp.check('filtres combinés catégorie + ville + prix', v_count = 1);
end $$;

do $$
declare v_count integer;
begin
  set local role anon;
  select count(*) into v_count from public.search_ads(p_city => 'Oyem');
  reset role;
  perform pg_temp.check('filtre ville sans résultat', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Favoris
-- ---------------------------------------------------------------------------
\echo '--- 5. Favoris ---'
do $$
declare v_ad uuid; v_state boolean;
begin
  select id into v_ad from public.ads where status = 'published';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select public.toggle_favorite(v_ad) into v_state;
  reset role;
  perform pg_temp.check('toggle_favorite ajoute le favori', v_state = true);
  perform pg_temp.check('compteur favorites_count incrémenté',
                        (select favorites_count = 1 from public.ads where id = v_ad));
end $$;

do $$
declare v_ad uuid; v_state boolean;
begin
  select id into v_ad from public.ads where status = 'published';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select public.toggle_favorite(v_ad) into v_state;
  reset role;
  perform pg_temp.check('toggle_favorite retire le favori', v_state = false);
  perform pg_temp.check('compteur favorites_count décrémenté',
                        (select favorites_count = 0 from public.ads where id = v_ad));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Conversations, messages et notifications
-- ---------------------------------------------------------------------------
\echo '--- 6. Messagerie ---'
do $$
declare v_ad uuid; v_conv uuid;
begin
  select id into v_ad from public.ads where status = 'published';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select public.get_or_create_conversation(v_ad) into v_conv;
  perform public.send_message(v_conv, 'Bonjour, le véhicule est-il toujours disponible ?');
  reset role;

  perform pg_temp.check('conversation créée', v_conv is not null);
  perform pg_temp.check('aperçu du dernier message dénormalisé',
    (select last_message_preview like 'Bonjour, le véhicule%' from public.conversations where id = v_conv));
  perform pg_temp.check('compteur de non-lus côté vendeur = 1',
    (select seller_unread_count = 1 and buyer_unread_count = 0
       from public.conversations where id = v_conv));
  perform pg_temp.check('notification créée pour le vendeur',
    (select count(*) = 1 from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'new_message'));
end $$;

-- Idempotence : deux appels rendent le même fil
do $$
declare v_ad uuid; v_a uuid; v_b uuid;
begin
  select id into v_ad from public.ads where status = 'published';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select public.get_or_create_conversation(v_ad) into v_a;
  select public.get_or_create_conversation(v_ad) into v_b;
  reset role;
  perform pg_temp.check('get_or_create_conversation est idempotente', v_a = v_b);
end $$;

-- Un tiers ne lit pas la conversation
do $$
declare v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into v_count from public.messages;
  reset role;
  perform pg_temp.check('un tiers ne lit AUCUN message du fil', v_count = 0);
end $$;

-- Un tiers ne peut pas s'insérer dans le fil
do $$
declare v_blocked boolean := false; v_conv uuid;
begin
  select id into v_conv from public.conversations limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conv, '33333333-3333-3333-3333-333333333333', 'Message intrus');
  exception when insufficient_privilege or check_violation then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('injection d''un message par un tiers REFUSÉE', v_blocked);
end $$;

-- Le vendeur répond puis marque comme lu
do $$
declare v_conv uuid; v_read integer;
begin
  select id into v_conv from public.conversations limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select public.mark_conversation_read(v_conv) into v_read;
  perform public.send_message(v_conv, 'Bonjour, oui il est disponible.');
  reset role;

  perform pg_temp.check('mark_conversation_read marque 1 message lu', v_read = 1);
  perform pg_temp.check('non-lus vendeur remis à zéro, acheteur passé à 1',
    (select seller_unread_count = 0 and buyer_unread_count = 1
       from public.conversations where id = v_conv));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Avis
-- ---------------------------------------------------------------------------
\echo '--- 7. Avis ---'
do $$
declare v_ad uuid;
begin
  select id into v_ad from public.ads where status = 'published';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  insert into public.reviews (ad_id, reviewer_id, reviewee_id, rating, comment)
  values (v_ad, '22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', 5, 'Vendeur sérieux et ponctuel.');
  reset role;

  perform pg_temp.check('note moyenne du vendeur recalculée',
    (select rating_average = 5.00 and rating_count = 1
       from public.users where id = '11111111-1111-1111-1111-111111111111'));
  perform pg_temp.check('notification d''avis envoyée',
    (select count(*) = 1 from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'new_review'));
end $$;

-- Un avis sans mise en relation est refusé
do $$
declare v_blocked boolean := false; v_ad uuid;
begin
  select id into v_ad from public.ads where status = 'published';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    insert into public.reviews (ad_id, reviewer_id, reviewee_id, rating, comment)
    values (v_ad, '33333333-3333-3333-3333-333333333333',
            '11111111-1111-1111-1111-111111111111', 1, 'Avis sans aucun échange préalable.');
  exception when insufficient_privilege or check_violation then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('avis sans mise en relation REFUSÉ (can_review)', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Quota d'annonces selon l'offre
-- ---------------------------------------------------------------------------
\echo '--- 8. Quotas ---'
do $$ begin perform pg_temp.check(
  'quota par défaut = plan free (5 annonces)',
  public.ad_quota('11111111-1111-1111-1111-111111111111') = 5
); end $$;

do $$
declare v_cat uuid; v_blocked boolean := false; i integer;
begin
  select id into v_cat from public.categories where slug = 'divers';
  -- Le vendeur a déjà 1 annonce publiée : on en ajoute 4 (total 5).
  for i in 1..4 loop
    insert into public.ads (seller_id, category_id, title, description, price, city, contact_phone)
    values ('11111111-1111-1111-1111-111111111111', v_cat,
            'Annonce de test numéro ' || i,
            'Description suffisamment longue pour satisfaire la contrainte de longueur.',
            10000, 'Libreville', '+2416123456');
  end loop;

  begin
    insert into public.ads (seller_id, category_id, title, description, price, city, contact_phone)
    values ('11111111-1111-1111-1111-111111111111', v_cat, 'Annonce au-delà du quota',
            'Description suffisamment longue pour satisfaire la contrainte de longueur.',
            10000, 'Libreville', '+2416123456');
  exception when raise_exception then
    v_blocked := true;
  end;

  perform pg_temp.check('6e annonce REFUSÉE : quota du plan free atteint', v_blocked);
end $$;

-- Un abonnement Pro relève le quota
do $$
declare v_plan uuid;
begin
  select id into v_plan from public.subscription_plans where code = 'pro';
  insert into public.subscriptions (user_id, plan_id, current_period_end)
  values ('11111111-1111-1111-1111-111111111111', v_plan, now() + interval '30 days');

  perform pg_temp.check('quota relevé à 100 avec l''offre Professionnel',
                        public.ad_quota('11111111-1111-1111-1111-111111111111') = 100);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Paiements (service_role) et effets métier
-- ---------------------------------------------------------------------------
\echo '--- 9. Paiements ---'
do $$
declare v_sub uuid; v_pay uuid; v_ref text;
begin
  select id into v_sub from public.subscriptions limit 1;
  insert into public.payments (user_id, purpose, subscription_id, provider, payer_phone, amount, status)
  values ('11111111-1111-1111-1111-111111111111', 'subscription', v_sub,
          'airtel_money', '+2416123456', 15000, 'pending')
  returning id, reference into v_pay, v_ref;

  perform pg_temp.check('référence de paiement générée (DI-PAY-…)', v_ref like 'DI-PAY-%');

  update public.payments set status = 'succeeded', paid_at = now() where id = v_pay;

  perform pg_temp.check('abonnement activé par le paiement abouti',
    (select status = 'active' from public.subscriptions where id = v_sub));
  perform pg_temp.check('notification de paiement confirmé émise',
    (select count(*) = 1 from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'payment_succeeded'));
end $$;

-- Mise en avant payée
do $$
declare v_ad uuid; v_pay uuid;
begin
  select id into v_ad from public.ads where status = 'published' limit 1;
  insert into public.payments (user_id, purpose, ad_id, provider, amount, status)
  values ('11111111-1111-1111-1111-111111111111', 'ad_feature', v_ad, 'moov_money', 2000, 'pending')
  returning id into v_pay;

  update public.payments set status = 'succeeded', paid_at = now() where id = v_pay;

  perform pg_temp.check('annonce mise en avant après paiement',
    (select is_featured and featured_until > now() from public.ads where id = v_ad));
end $$;

-- Idempotence des callbacks opérateur
do $$
declare v_blocked boolean := false;
begin
  insert into public.payments (user_id, purpose, provider, provider_reference, amount, status)
  values ('11111111-1111-1111-1111-111111111111', 'other', 'airtel_money', 'TXN-ABC-123', 1000, 'pending');
  begin
    insert into public.payments (user_id, purpose, provider, provider_reference, amount, status)
    values ('11111111-1111-1111-1111-111111111111', 'other', 'airtel_money', 'TXN-ABC-123', 1000, 'pending');
  exception when unique_violation then
    v_blocked := true;
  end;
  perform pg_temp.check('rejeu du callback opérateur REJETÉ (idempotence)', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Signalements et contrainte de cohérence
-- ---------------------------------------------------------------------------
\echo '--- 10. Signalements ---'
do $$
declare v_ad uuid;
begin
  select id into v_ad from public.ads where status = 'published' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  insert into public.reports (reporter_id, target_type, ad_id, reason, details)
  values ('22222222-2222-2222-2222-222222222222', 'ad', v_ad, 'fraud', 'Prix suspect.');
  reset role;
  perform pg_temp.check('signalement d''annonce enregistré',
                        (select count(*) = 1 from public.reports));
end $$;

do $$
declare v_blocked boolean := false; v_ad uuid;
begin
  select id into v_ad from public.ads where status = 'published' limit 1;
  begin
    insert into public.reports (reporter_id, target_type, ad_id, target_user_id, reason)
    values ('22222222-2222-2222-2222-222222222222', 'ad', v_ad,
            '11111111-1111-1111-1111-111111111111', 'spam');
  exception when check_violation then
    v_blocked := true;
  end;
  perform pg_temp.check('signalement à cible incohérente REFUSÉ', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 11. Maintenance planifiée
-- ---------------------------------------------------------------------------
\echo '--- 11. Maintenance ---'
do $$
declare v_expired integer;
begin
  update public.ads set expires_at = now() - interval '1 day'
   where status = 'published';
  select public.expire_ads() into v_expired;
  perform pg_temp.check('expire_ads() bascule les annonces échues', v_expired > 0);
  perform pg_temp.check('notification d''expiration émise',
    (select count(*) > 0 from public.notifications where type = 'ad_expired'));
end $$;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.platform_stats;
  perform public.refresh_platform_stats();
  perform pg_temp.check('vue matérialisée platform_stats exploitable', v_count = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 12. Suppression en cascade
-- ---------------------------------------------------------------------------
\echo '--- 12. Cascade ---'
do $$
declare v_ad uuid;
begin
  select id into v_ad from public.ads limit 1;
  insert into public.ad_images (ad_id, storage_path, "position")
  values (v_ad, '11111111-1111-1111-1111-111111111111/' || v_ad || '/photo.jpg', 0);

  delete from public.ads where id = v_ad;

  perform pg_temp.check('les photos suivent la suppression de l''annonce',
                        (select count(*) = 0 from public.ad_images where ad_id = v_ad));
  perform pg_temp.check('les conversations suivent la suppression de l''annonce',
                        (select count(*) = 0 from public.conversations where ad_id = v_ad));
end $$;

\echo ''
\echo '============================================'
\echo '  TOUS LES TESTS SONT PASSÉS'
\echo '============================================'
