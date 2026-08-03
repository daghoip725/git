-- =============================================================================
--  Tests de modération : signalement de compte, file de triage, blocage
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
  ('d0000000-0000-0000-0000-000000000001', 'arnaqueur@test.ga',  '{"full_name":"Compte Suspect"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000002', 'temoin1@test.ga',    '{"full_name":"Temoin Un"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000003', 'temoin2@test.ga',    '{"full_name":"Temoin Deux"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000004', 'temoin3@test.ga',    '{"full_name":"Temoin Trois"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000005', 'moderateur@test.ga', '{"full_name":"Moderateur Test"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000006', 'admin.mod@test.ga',  '{"full_name":"Admin Mod"}'::jsonb);

update public.users set role = 'moderator' where id = 'd0000000-0000-0000-0000-000000000005';
update public.users set role = 'admin'     where id = 'd0000000-0000-0000-0000-000000000006';

-- ---------------------------------------------------------------------------
-- 1. Signaler un compte
-- ---------------------------------------------------------------------------
\echo '--- 1. Signalement de compte ---'

do $$
declare v_id uuid; v_row public.reports; v_blocked boolean; v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  v_id := public.report_user('d0000000-0000-0000-0000-000000000001', 'fraud',
                             'Demande un acompte avant toute rencontre.');
  reset role;

  perform pg_temp.check('le signalement est enregistré', v_id is not null);

  select * into v_row from public.reports where id = v_id;
  perform pg_temp.check('la cible est bien le compte', v_row.target_user_id = 'd0000000-0000-0000-0000-000000000001');
  perform pg_temp.check('le type déclaré est cohérent', v_row.target_type = 'user');
  perform pg_temp.check('aucune annonce n''est visée', v_row.ad_id is null);
  perform pg_temp.check('le signaleur est enregistré',
    v_row.reporter_id = 'd0000000-0000-0000-0000-000000000002');
  perform pg_temp.check('le dossier s''ouvre au statut « ouvert »', v_row.status = 'open');
  perform pg_temp.check('le motif est conservé', v_row.reason = 'fraud');
  perform pg_temp.check('le détail est conservé', v_row.details like 'Demande un acompte%');

  -- Deuxième signalement du même compte par la même personne : rien de neuf.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  v_id := public.report_user('d0000000-0000-0000-0000-000000000001', 'spam', 'Encore');
  reset role;

  select count(*) into v_count from public.reports
   where target_user_id = 'd0000000-0000-0000-0000-000000000001';
  perform pg_temp.check('un second signalement par la même personne ne duplique pas', v_count = 1);
  perform pg_temp.check('le doublon ne renvoie aucun identifiant', v_id is null);

  -- On ne se signale pas soi-même.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'select public.report_user(''d0000000-0000-0000-0000-000000000002'', ''spam'')');
  reset role;
  perform pg_temp.check('l''auto-signalement est REFUSÉ', v_blocked);

  -- Compte inexistant.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'select public.report_user(''00000000-0000-0000-0000-000000000000'', ''spam'')');
  reset role;
  perform pg_temp.check('un compte inexistant est REFUSÉ', v_blocked);

  -- Visiteur anonyme.
  set local role anon;
  v_blocked := pg_temp.fails_as(null,
    'select public.report_user(''d0000000-0000-0000-0000-000000000001'', ''spam'')');
  reset role;
  perform pg_temp.check('un visiteur anonyme est REFUSÉ', v_blocked);

  -- Écriture directe interdite : elle permettrait de forger `reporter_id`.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'insert into public.reports (reporter_id, target_type, target_user_id, reason)
     values (''d0000000-0000-0000-0000-000000000003'', ''user'',
             ''d0000000-0000-0000-0000-000000000001'', ''fraud'')');
  reset role;
  perform pg_temp.check('forger le signaleur est REFUSÉ', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Confidentialité des signalements
-- ---------------------------------------------------------------------------
\echo '--- 2. Confidentialité ---'

do $$
declare v_count integer;
begin
  -- Le compte visé ne doit pas savoir qui l'a signalé.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  select count(*) into v_count from public.reports
   where target_user_id = 'd0000000-0000-0000-0000-000000000001';
  reset role;
  perform pg_temp.check('le compte visé ne voit PAS les signalements le concernant',
    v_count = 0);

  -- Un tiers non plus.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000004', true);
  select count(*) into v_count from public.reports;
  reset role;
  perform pg_temp.check('un tiers ne voit aucun signalement', v_count = 0);

  -- Le signaleur voit le sien : il doit pouvoir constater qu'il a été pris en
  -- compte.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.reports;
  reset role;
  perform pg_temp.check('le signaleur retrouve son propre signalement', v_count = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 3. File de triage
-- ---------------------------------------------------------------------------
\echo '--- 3. File de triage ---'

do $$
declare
  v_row     record;
  v_blocked boolean;
  v_cat     uuid;
  v_ad      uuid;
begin
  -- Deux témoins de plus : trois signaleurs distincts au total.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', true);
  perform public.report_user('d0000000-0000-0000-0000-000000000001', 'fake_profile');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000004', true);
  perform public.report_user('d0000000-0000-0000-0000-000000000001', 'harassment');
  reset role;

  -- Une annonce signalée une seule fois, pour vérifier l'ordre de priorité.
  select id into v_cat from public.categories where is_active order by position limit 1;
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('d0000000-0000-0000-0000-000000000003', v_cat, 'Annonce quelconque',
          'Description sans particularité, pour les besoins du test.',
          50000, 'fixed', 'Libreville', 'published')
  returning id into v_ad;

  insert into public.reports (reporter_id, target_type, ad_id, reason)
  values ('d0000000-0000-0000-0000-000000000002', 'ad', v_ad, 'wrong_category');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000005', true);

  select * into v_row from public.moderation_queue(50) limit 1;
  perform pg_temp.check('la cible la plus signalée arrive en tête',
    v_row.target_id = 'd0000000-0000-0000-0000-000000000001');
  perform pg_temp.check('les signaleurs distincts sont comptés', v_row.reporter_count = 3);
  perform pg_temp.check('le nombre de signalements est compté', v_row.report_count = 3);
  perform pg_temp.check('les motifs sont regroupés', array_length(v_row.reasons, 1) = 3);
  perform pg_temp.check('le libellé de la cible est lisible',
    v_row.target_label = 'Compte Suspect');
  perform pg_temp.check('un lien vers la cible est fourni',
    v_row.target_href = '/vendeurs/d0000000-0000-0000-0000-000000000001');
  perform pg_temp.check('le statut du compte visé est remonté', v_row.target_status = 'active');
  perform pg_temp.check('la date du premier signalement est remontée',
    v_row.first_reported is not null);

  -- Les annonces signalées figurent aussi dans la file, après.
  perform pg_temp.check('les annonces signalées figurent dans la file',
    exists (select 1 from public.moderation_queue(50) q
             where q.target_type = 'ad' and q.target_id = v_ad));

  reset role;

  -- La file est fermée au public : elle nomme des personnes signalées.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'select * from public.moderation_queue(10)');
  reset role;
  perform pg_temp.check('la file de triage est FERMÉE au public', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Dossier d'un compte
-- ---------------------------------------------------------------------------
\echo '--- 4. Dossier ---'

do $$
declare v_row record; v_blocked boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000005', true);
  select * into v_row from public.account_dossier('d0000000-0000-0000-0000-000000000001');
  reset role;

  perform pg_temp.check('le dossier porte le nom du compte', v_row.full_name = 'Compte Suspect');
  perform pg_temp.check('le dossier compte les signalements reçus', v_row.reports_received = 3);
  perform pg_temp.check('le dossier compte les signaleurs distincts',
    v_row.reporters_distinct = 3);
  perform pg_temp.check('le dossier compte les signalements émis par ce compte',
    v_row.reports_filed = 0);

  -- Un signaleur compulsif se repère au nombre de dossiers qu'il a ouverts.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000005', true);
  select * into v_row from public.account_dossier('d0000000-0000-0000-0000-000000000002');
  reset role;
  perform pg_temp.check('les signalements émis sont comptés', v_row.reports_filed = 2);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'select * from public.account_dossier(''d0000000-0000-0000-0000-000000000001'')');
  reset role;
  perform pg_temp.check('le dossier est FERMÉ au public', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Blocage d'un compte
-- ---------------------------------------------------------------------------
\echo '--- 5. Blocage ---'

do $$
declare v_closed integer; v_blocked boolean; v_count integer;
begin
  -- Un compte ordinaire ne bloque personne.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'select public.block_account(''d0000000-0000-0000-0000-000000000001'', ''banned'')');
  reset role;
  perform pg_temp.check('un compte ordinaire ne peut PAS bloquer', v_blocked);

  -- Le modérateur, si.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000005', true);
  v_closed := public.block_account('d0000000-0000-0000-0000-000000000001', 'banned',
                                   'Sollicitations frauduleuses répétées.');
  reset role;

  perform pg_temp.check('le compte est banni',
    (select status from public.users where id = 'd0000000-0000-0000-0000-000000000001') = 'banned');
  perform pg_temp.check('les signalements visant ce compte sont clos d''un geste', v_closed = 3);
  perform pg_temp.check('plus aucun dossier ouvert sur ce compte',
    not exists (select 1 from public.reports
                 where target_user_id = 'd0000000-0000-0000-0000-000000000001'
                   and status in ('open', 'reviewing')));
  perform pg_temp.check('la clôture porte le motif du blocage',
    exists (select 1 from public.reports
             where target_user_id = 'd0000000-0000-0000-0000-000000000001'
               and resolution_note like 'Sollicitations frauduleuses%'));
  perform pg_temp.check('le blocage est tracé au journal d''audit',
    exists (select 1 from public.auth_audit_log
             where target_user_id = 'd0000000-0000-0000-0000-000000000001'
               and action = 'status_changed'));

  -- Le compte banni sort de la file de triage.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000005', true);
  select count(*) into v_count from public.moderation_queue(50) q
   where q.target_id = 'd0000000-0000-0000-0000-000000000001';
  reset role;
  perform pg_temp.check('un compte traité sort de la file', v_count = 0);

  -- On ne se bloque pas soi-même.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000005',
    'select public.block_account(''d0000000-0000-0000-0000-000000000005'', ''banned'')');
  reset role;
  perform pg_temp.check('se bloquer soi-même est REFUSÉ', v_blocked);

  -- Un modérateur ne sanctionne pas un administrateur.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000005',
    'select public.block_account(''d0000000-0000-0000-0000-000000000006'', ''suspended'')');
  reset role;
  perform pg_temp.check('un modérateur ne sanctionne PAS un administrateur', v_blocked);

  -- Un statut invalide est refusé plutôt que silencieusement ignoré.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000005',
    'select public.block_account(''d0000000-0000-0000-0000-000000000004'', ''deleted'')');
  reset role;
  perform pg_temp.check('un statut de blocage invalide est REFUSÉ', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Aucune sanction automatique
-- ---------------------------------------------------------------------------
\echo '--- 6. Aucune sanction automatique ---'

do $$
declare v_status public.account_status;
begin
  -- Trois signalements sur un compte neuf : il reste actif. Un seuil qui
  -- bannirait automatiquement offrirait à tout groupe coordonné le moyen de
  -- faire taire un concurrent.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  perform public.report_user('d0000000-0000-0000-0000-000000000004', 'fraud');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', true);
  perform public.report_user('d0000000-0000-0000-0000-000000000004', 'fraud');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  begin
    perform public.report_user('d0000000-0000-0000-0000-000000000004', 'fraud');
  exception when others then
    -- Un compte banni ne peut plus signaler : c'est le comportement attendu.
    null;
  end;
  reset role;

  select status into v_status from public.users
   where id = 'd0000000-0000-0000-0000-000000000004';
  perform pg_temp.check('un compte signalé reste ACTIF tant qu''un humain n''a pas tranché',
    v_status = 'active');

  perform pg_temp.check('ses annonces restent en ligne',
    not exists (select 1 from public.ads
                 where seller_id = 'd0000000-0000-0000-0000-000000000004'
                   and status = 'archived'));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Un compte banni est neutralisé
-- ---------------------------------------------------------------------------
\echo '--- 7. Compte banni ---'

do $$
declare v_blocked boolean; v_count integer;
begin
  -- Ses annonces sont retirées de la vitrine.
  select count(*) into v_count from public.ads
   where seller_id = 'd0000000-0000-0000-0000-000000000001' and status = 'published';
  perform pg_temp.check('aucune annonce du compte banni ne reste publiée', v_count = 0);

  -- Il ne peut plus signaler.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000001',
    'select public.report_user(''d0000000-0000-0000-0000-000000000003'', ''spam'')');
  reset role;
  perform pg_temp.check('un compte banni ne peut plus signaler', v_blocked);

  -- Il ne peut plus publier.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000001',
    'insert into public.ads (seller_id, category_id, title, description, city, price_type)
     select auth.uid(), id, ''Nouvelle tentative'',
            ''Description de test suffisamment longue pour passer.'', ''Libreville'', ''fixed''
       from public.categories where is_active limit 1');
  reset role;
  perform pg_temp.check('un compte banni ne peut plus publier', v_blocked);

  -- La réactivation le remet en état de signaler.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000006', true);
  perform public.block_account('d0000000-0000-0000-0000-000000000001', 'active',
                               'Décision revue après examen.');
  reset role;

  perform pg_temp.check('le compte est réactivé',
    (select status from public.users where id = 'd0000000-0000-0000-0000-000000000001') = 'active');
  perform pg_temp.check('la réactivation prévient l''intéressé',
    exists (select 1 from public.notifications
             where user_id = 'd0000000-0000-0000-0000-000000000001'
               and title like '%réactivé%'));
end $$;

\echo ''
\echo '  TESTS MODÉRATION : TOUS PASSÉS'
