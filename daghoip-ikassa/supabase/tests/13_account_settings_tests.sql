-- =============================================================================
--  Tests des paramètres du compte : langue et suppression
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
  ('f0000000-0000-0000-0000-000000000001', 'partant@test.ga',   '{"full_name":"Vendeur Partant"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000002', 'acheteur@test.ga',  '{"full_name":"Acheteur Reste"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000003', 'curieux@test.ga',   '{"full_name":"Curieux Tiers"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000004', 'patron@test.ga',    '{"full_name":"Patron Admin"}'::jsonb);

update public.users set role = 'admin' where id = 'f0000000-0000-0000-0000-000000000004';

-- ---------------------------------------------------------------------------
-- 1. Langue d'interface
-- ---------------------------------------------------------------------------
\echo '--- 1. Langue ---'

do $$
declare v_lang public.app_language; v_blocked boolean;
begin
  select language into v_lang from public.users
   where id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('le français est la langue par défaut', v_lang = 'fr');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  update public.users set language = 'en' where id = 'f0000000-0000-0000-0000-000000000001';
  reset role;

  select language into v_lang from public.users
   where id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('le compte change sa propre langue', v_lang = 'en');

  -- La préférence remonte par `get_my_profile()`, seul chemin de lecture.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  select (public.get_my_profile()).language into v_lang;
  reset role;
  perform pg_temp.check('la préférence est lisible par son propriétaire', v_lang = 'en');

  -- Personne ne change la langue d'autrui.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000003',
    'update public.users set language = ''fr'' where id = ''f0000000-0000-0000-0000-000000000001''');
  reset role;
  select language into v_lang from public.users
   where id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('un tiers ne change PAS la langue d''autrui', v_lang = 'en');

  -- Une valeur hors énumération est refusée par le type lui-même.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    'update public.users set language = ''klingon'' where id = ''f0000000-0000-0000-0000-000000000001''');
  reset role;
  perform pg_temp.check('une langue inconnue est REFUSÉE', v_blocked);

  update public.users set language = 'fr' where id = 'f0000000-0000-0000-0000-000000000001';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Mise en place du compte à supprimer
-- ---------------------------------------------------------------------------
\echo '--- 2. Préparation ---'

do $$
declare v_cat uuid; v_ad uuid; v_conv uuid; v_count integer;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  update public.users
     set phone = '+241612345678', whatsapp = '+241612345678', city = 'Libreville',
         bio = 'Vend du matériel de chantier.', avatar_path = 'f0000000-0000-0000-0000-000000000001/moi.jpg',
         business_name = 'Chantiers du Komo', is_professional = true
   where id = 'f0000000-0000-0000-0000-000000000001';

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status, contact_phone, contact_whatsapp)
  values ('f0000000-0000-0000-0000-000000000001', v_cat, 'Bétonnière 350 litres',
          'Moteur thermique, très bon état, révisée le mois dernier.',
          950000, 'negotiable', 'Libreville', 'published', '+241612345678', '+241612345678')
  returning id into v_ad;

  insert into public.ad_images (ad_id, storage_path, "position")
  values (v_ad, 'f0000000-0000-0000-0000-000000000001/' || v_ad::text || '/1.jpg', 0);

  -- Une conversation avec un acheteur : elle devra survivre au départ.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
  v_conv := public.get_or_create_conversation(v_ad);
  perform public.send_message(v_conv, 'Bonjour, la bétonnière est-elle disponible ?');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  perform public.send_message(v_conv, 'Oui, passez la voir quand vous voulez.');
  perform public.toggle_favorite(v_ad);
  reset role;

  -- Un signalement émis par le partant : il devra rester ouvert.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  perform public.report_user('f0000000-0000-0000-0000-000000000003', 'fraud',
                             'Demande un acompte avant toute rencontre.');
  reset role;

  select count(*) into v_count from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where c.id = v_conv;
  perform pg_temp.check('la conversation compte deux messages', v_count = 2);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Suppression : ce qui disparaît
-- ---------------------------------------------------------------------------
\echo '--- 3. Suppression ---'

do $$
declare v_row record; v_user public.users; v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  select * into v_row from public.delete_my_account();
  reset role;

  perform pg_temp.check('l''annonce est archivée', v_row.ads_archived = 1);
  perform pg_temp.check('les photos sont retirées', v_row.images_removed = 1);
  perform pg_temp.check('les favoris sont retirés', v_row.favorites_removed = 1);
  perform pg_temp.check('le signalement émis est détaché', v_row.reports_detached = 1);

  select * into v_user from public.users where id = 'f0000000-0000-0000-0000-000000000001';

  perform pg_temp.check('le compte porte le statut supprimé', v_user.status = 'deleted');
  perform pg_temp.check('le nom est remplacé', v_user.full_name = 'Compte supprimé');
  perform pg_temp.check('le téléphone est effacé', v_user.phone is null);
  perform pg_temp.check('le WhatsApp est effacé', v_user.whatsapp is null);
  perform pg_temp.check('la ville est effacée', v_user.city is null);
  perform pg_temp.check('la biographie est effacée', v_user.bio is null);
  perform pg_temp.check('l''avatar est effacé', v_user.avatar_path is null);
  perform pg_temp.check('la raison sociale est effacée', v_user.business_name is null);
  perform pg_temp.check('le badge vérifié tombe', not v_user.is_verified);

  -- Les annonces quittent la vitrine, coordonnées comprises.
  select count(*) into v_count from public.ads
   where seller_id = 'f0000000-0000-0000-0000-000000000001' and status = 'published';
  perform pg_temp.check('plus aucune annonce publiée', v_count = 0);

  select count(*) into v_count from public.ads
   where seller_id = 'f0000000-0000-0000-0000-000000000001'
     and (contact_phone is not null or contact_whatsapp is not null);
  perform pg_temp.check('les coordonnées des annonces sont effacées', v_count = 0);

  select count(*) into v_count from public.ad_images i
    join public.ads a on a.id = i.ad_id
   where a.seller_id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('aucune photo ne subsiste', v_count = 0);

  select count(*) into v_count from public.favorites
   where user_id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('aucun favori ne subsiste', v_count = 0);

  select count(*) into v_count from public.notifications
   where user_id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('aucune notification ne subsiste', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Ce qui doit survivre — et pourquoi
-- ---------------------------------------------------------------------------
\echo '--- 4. Survivants ---'

do $$
declare v_count integer; v_reporter uuid;
begin
  /*
   * Les messages appartiennent à la conversation, pas au seul expéditeur.
   * Les effacer laisserait l'acheteur avec un fil à sens unique : il perdrait
   * l'historique de sa propre négociation parce que quelqu'un d'autre est
   * parti.
   */
  select count(*) into v_count from public.messages
   where sender_id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('les messages envoyés SURVIVENT', v_count = 1);

  select count(*) into v_count from public.conversations
   where seller_id = 'f0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('la conversation de l''acheteur SURVIT', v_count = 1);

  -- Le signalement reste ouvert, sans auteur : partir ne doit pas effacer une
  -- accusation que la modération n'a pas encore instruite.
  select count(*) into v_count from public.reports
   where target_user_id = 'f0000000-0000-0000-0000-000000000003' and status = 'open';
  perform pg_temp.check('le signalement émis reste OUVERT', v_count = 1);

  select reporter_id into v_reporter from public.reports
   where target_user_id = 'f0000000-0000-0000-0000-000000000003' limit 1;
  perform pg_temp.check('le signalement n''a plus d''auteur', v_reporter is null);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Un compte supprimé n'agit plus
-- ---------------------------------------------------------------------------
\echo '--- 5. Après le départ ---'

do $$
declare v_cat uuid; v_blocked boolean; v_sql text;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  /*
   * Garantie de dernier recours : même si la révocation côté authentification
   * échouait et qu'une session restait valide, le compte ne peut plus rien
   * faire. `is_active_account()` n'accepte que le statut « active ».
   */
  v_sql := 'insert into public.ads (seller_id, category_id, title, description, price, price_type, city, status)
            values (%L, %L, ''Retour surprise'', ''Description suffisamment longue pour passer.'', 1000, ''fixed'', ''Libreville'', ''published'')';

  /*
   * Contre-épreuve d'abord. `fails_as` absorbe **n'importe quelle** exception :
   * une faute de frappe dans la requête serait comptée comme un refus, et le
   * test passerait au vert sans avoir rien prouvé. On vérifie donc que la même
   * requête aboutit pour un compte actif avant d'affirmer qu'elle est refusée
   * pour le compte supprimé.
   */
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000002',
    format(v_sql, 'f0000000-0000-0000-0000-000000000002', v_cat));
  reset role;
  perform pg_temp.check('témoin : la même requête PASSE pour un compte actif', not v_blocked);

  delete from public.ads where title = 'Retour surprise';

  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    format(v_sql, 'f0000000-0000-0000-0000-000000000001', v_cat));
  reset role;
  perform pg_temp.check('un compte supprimé ne publie PLUS', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    'select public.report_user(''f0000000-0000-0000-0000-000000000003'', ''spam'', null)');
  reset role;
  perform pg_temp.check('un compte supprimé ne signale PLUS', v_blocked);

  -- Le profil sort aussi de la vitrine publique : la politique RLS de `users`
  -- exclut déjà les comptes supprimés pour les tiers.
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.check('le profil supprimé est INVISIBLE au public',
    (select count(*) from public.users where id = 'f0000000-0000-0000-0000-000000000001') = 0);
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Garde-fous
-- ---------------------------------------------------------------------------
\echo '--- 6. Garde-fous ---'

do $$
declare v_blocked boolean; v_status public.account_status;
begin
  -- Deux fois de suite : la seconde doit refuser plutôt que de repasser sur un
  -- compte déjà anonymisé.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000001',
    'select * from public.delete_my_account()');
  reset role;
  perform pg_temp.check('une seconde suppression est REFUSÉE', v_blocked);

  /*
   * Un administrateur ne se supprime pas depuis l'application : le dernier
   * d'entre eux laisserait la plateforme sans personne pour la modérer, et
   * aucun écran ne permettrait plus d'en nommer un autre.
   */
  set local role authenticated;
  v_blocked := pg_temp.fails_as('f0000000-0000-0000-0000-000000000004',
    'select * from public.delete_my_account()');
  reset role;
  perform pg_temp.check('un administrateur ne se supprime PAS', v_blocked);

  select status into v_status from public.users
   where id = 'f0000000-0000-0000-0000-000000000004';
  perform pg_temp.check('le compte administrateur reste actif', v_status = 'active');

  -- Un visiteur anonyme n'a rien à supprimer.
  set local role anon;
  v_blocked := pg_temp.fails_as(null, 'select * from public.delete_my_account()');
  reset role;
  perform pg_temp.check('un visiteur anonyme est REFUSÉ', v_blocked);

  /*
   * La fonction ne prend aucun paramètre : il n'existe aucune façon de
   * l'appeler pour le compte de quelqu'un d'autre. On le vérifie par
   * `pg_proc` — le jour où quelqu'un ajoutera un `p_user_id` « pour
   * l'administration », ce test le dira.
   */
  perform pg_temp.check('la fonction n''accepte AUCUN paramètre',
    (select pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'delete_my_account') = 0);

  -- L'acheteur, lui, n'a rien perdu.
  select status into v_status from public.users
   where id = 'f0000000-0000-0000-0000-000000000002';
  perform pg_temp.check('l''acheteur est intact', v_status = 'active');
end $$;

\echo '  TESTS PARAMÈTRES DU COMPTE : TOUS PASSÉS'
