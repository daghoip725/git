-- =============================================================================
--  Tests des notifications : alertes, préférences, file d'envoi
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
  ('b0000000-0000-0000-0000-000000000001', 'vendeur.notif@test.ga', '{"full_name":"Vendeur Notif"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'acheteur.notif@test.ga', '{"full_name":"Acheteur Notif"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000003', 'staff.notif@test.ga', '{"full_name":"Staff Notif"}'::jsonb);

update public.users set role = 'admin' where id = 'b0000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1. Annonce approuvée par un modérateur
-- ---------------------------------------------------------------------------
\echo '--- 1. Annonce approuvée ---'

do $$
declare
  v_cat   uuid;
  v_ad    uuid;
  v_notif public.notifications;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  -- Une annonce mise en revue manuelle : c'est le cas où le vendeur attend.
  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Ordinateur portable Dell',
          'Bon état, chargeur inclus, batterie tenant deux heures.',
          150000, 'fixed', 'Libreville', 'pending_review')
  returning id into v_ad;

  perform pg_temp.check('aucune alerte tant que l''annonce est en revue',
    not exists (select 1 from public.notifications
                 where user_id = 'b0000000-0000-0000-0000-000000000001'
                   and type = 'ad_approved'));

  -- Le modérateur approuve.
  update public.ads set status = 'published' where id = v_ad;

  select * into v_notif from public.notifications
   where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'ad_approved';

  perform pg_temp.check('le vendeur est prévenu de l''approbation', v_notif.id is not null);
  perform pg_temp.check('l''alerte pointe vers l''annonce', v_notif.link like '/annonces/%');
  perform pg_temp.check('l''alerte porte le titre de l''annonce',
    v_notif.body like '%Ordinateur portable Dell%');
  perform pg_temp.check('la charge utile porte l''identifiant de l''annonce',
    (v_notif.data ->> 'ad_id')::uuid = v_ad);

  -- Une modification sans changement de statut ne renotifie pas.
  update public.ads set price = 140000 where id = v_ad;
  perform pg_temp.check('une simple modification ne renotifie pas',
    (select count(*) from public.notifications
      where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'ad_approved') = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Publication directe (sans revue)
-- ---------------------------------------------------------------------------
\echo '--- 2. Publication directe ---'

do $$
declare v_cat uuid; v_ad uuid;
begin
  select id into v_cat from public.categories where is_active order by position limit 1;

  insert into public.ads (seller_id, category_id, title, description, price, price_type,
                          city, status)
  values ('b0000000-0000-0000-0000-000000000001', v_cat, 'Table basse en bois',
          'Table basse robuste, quelques marques d''usage sur le plateau.',
          35000, 'fixed', 'Libreville', 'draft')
  returning id into v_ad;

  update public.ads set status = 'published' where id = v_ad;

  perform pg_temp.check('une publication directe donne « en ligne », pas « approuvée »',
    exists (select 1 from public.notifications
             where user_id = 'b0000000-0000-0000-0000-000000000001'
               and type = 'ad_published'
               and data ->> 'ad_id' = v_ad::text));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Favori reçu
-- ---------------------------------------------------------------------------
\echo '--- 3. Favori ---'

do $$
declare v_ad uuid; v_count integer;
begin
  select id into v_ad from public.ads
   where seller_id = 'b0000000-0000-0000-0000-000000000001' and status = 'published'
   limit 1;

  insert into public.favorites (user_id, ad_id)
  values ('b0000000-0000-0000-0000-000000000002', v_ad);

  perform pg_temp.check('le vendeur est prévenu du favori',
    exists (select 1 from public.notifications
             where user_id = 'b0000000-0000-0000-0000-000000000001'
               and type = 'new_favorite'));

  -- Un second favori le même jour ne renotifie pas : la cloche n'est pas un
  -- compteur de clics.
  delete from public.favorites
   where user_id = 'b0000000-0000-0000-0000-000000000002' and ad_id = v_ad;
  insert into public.favorites (user_id, ad_id)
  values ('b0000000-0000-0000-0000-000000000002', v_ad);

  select count(*) into v_count from public.notifications
   where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'new_favorite';
  perform pg_temp.check('un second favori le même jour ne renotifie pas', v_count = 1);

  -- Se mettre soi-même en favori ne notifie personne.
  insert into public.favorites (user_id, ad_id)
  values ('b0000000-0000-0000-0000-000000000001', v_ad);
  select count(*) into v_count from public.notifications
   where user_id = 'b0000000-0000-0000-0000-000000000001' and type = 'new_favorite';
  perform pg_temp.check('l''auto-favori ne notifie pas', v_count = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 4. File d'envoi des e-mails
-- ---------------------------------------------------------------------------
\echo '--- 4. File d''envoi ---'

do $$
declare
  v_before integer;
  v_row    public.email_outbox;
  v_notif  uuid;
begin
  -- Une alerte de statut d'annonce est mise en file (préférence active par défaut).
  perform pg_temp.check('les alertes d''annonce sont mises en file',
    exists (select 1 from public.email_outbox
             where user_id = 'b0000000-0000-0000-0000-000000000001'
               and kind = 'ad_approved'));

  -- Un favori, lui, reste dans l'application : pas de courriel pour un cœur.
  perform pg_temp.check('un favori ne déclenche AUCUN e-mail',
    not exists (select 1 from public.email_outbox where kind = 'new_favorite'));

  -- Message : mis en file avec un délai de grâce.
  select count(*) into v_before from public.email_outbox;
  v_notif := public.create_notification(
    'b0000000-0000-0000-0000-000000000001', 'new_message',
    'Nouveau message', 'Bonjour, l''article est-il disponible ?', '/messages/abc',
    jsonb_build_object('conversation_id', '11111111-1111-1111-1111-111111111111')
  );

  select * into v_row from public.email_outbox
   where user_id = 'b0000000-0000-0000-0000-000000000001' and kind = 'new_message';

  perform pg_temp.check('le message est mis en file', v_row.id is not null);
  perform pg_temp.check('le message attend un délai de grâce', v_row.not_before > now());
  perform pg_temp.check('la charge utile porte le lien et le titre',
    v_row.payload ->> 'link' = '/messages/abc' and v_row.payload ->> 'title' = 'Nouveau message');

  -- Dix messages dans la même conversation ne font qu'un courriel.
  perform public.create_notification(
    'b0000000-0000-0000-0000-000000000001', 'new_message',
    'Nouveau message', 'Toujours là ?', '/messages/abc',
    jsonb_build_object('conversation_id', '11111111-1111-1111-1111-111111111111')
  );
  perform pg_temp.check('une rafale de messages ne fait qu''un seul e-mail',
    (select count(*) from public.email_outbox
      where user_id = 'b0000000-0000-0000-0000-000000000001'
        and kind = 'new_message') = 1);

  -- Une autre conversation, en revanche, mérite son propre courriel.
  perform public.create_notification(
    'b0000000-0000-0000-0000-000000000001', 'new_message',
    'Nouveau message', 'Bonjour', '/messages/def',
    jsonb_build_object('conversation_id', '22222222-2222-2222-2222-222222222222')
  );
  perform pg_temp.check('une autre conversation donne un second e-mail',
    (select count(*) from public.email_outbox
      where user_id = 'b0000000-0000-0000-0000-000000000001'
        and kind = 'new_message') = 2);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Préférences
-- ---------------------------------------------------------------------------
\echo '--- 5. Préférences ---'

do $$
declare v_settings public.notification_settings; v_blocked boolean; v_count integer;
begin
  -- Valeurs par défaut sans ligne enregistrée.
  v_settings := public.effective_notification_settings('b0000000-0000-0000-0000-000000000002');
  perform pg_temp.check('les messages sont notifiés par défaut', v_settings.email_messages);
  perform pg_temp.check('les avis ne le sont PAS par défaut', not v_settings.email_reviews);
  perform pg_temp.check('un délai de grâce par défaut est appliqué',
    v_settings.message_email_delay_minutes > 0);

  -- Refus explicite des e-mails de message.
  insert into public.notification_settings (user_id, email_messages)
  values ('b0000000-0000-0000-0000-000000000002', false);

  select count(*) into v_count from public.email_outbox
   where user_id = 'b0000000-0000-0000-0000-000000000002';

  perform public.create_notification(
    'b0000000-0000-0000-0000-000000000002', 'new_message',
    'Nouveau message', 'Bonjour', '/messages/xyz',
    jsonb_build_object('conversation_id', '33333333-3333-3333-3333-333333333333')
  );

  perform pg_temp.check('la préférence est respectée : aucun e-mail',
    (select count(*) from public.email_outbox
      where user_id = 'b0000000-0000-0000-0000-000000000002') = v_count);

  -- Mais la notification dans l'application, elle, reste envoyée : refuser
  -- l'e-mail n'est pas refuser d'être informé.
  perform pg_temp.check('la notification dans l''application reste envoyée',
    exists (select 1 from public.notifications
             where user_id = 'b0000000-0000-0000-0000-000000000002'
               and type = 'new_message'));

  -- Un tiers ne lit pas les préférences d'autrui.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
  perform pg_temp.check('un tiers ne voit PAS les préférences d''autrui',
    (select count(*) from public.notification_settings
      where user_id = 'b0000000-0000-0000-0000-000000000002') = 0);
  reset role;

  -- La file d'envoi est fermée au client : elle contient des adresses e-mail.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('b0000000-0000-0000-0000-000000000001',
    'select count(*) from public.email_outbox');
  reset role;
  perform pg_temp.check('la file d''envoi est FERMÉE au client', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Travailleur d'envoi
-- ---------------------------------------------------------------------------
\echo '--- 6. Travailleur ---'

do $$
declare
  v_claimed integer;
  v_row     record;
  v_id      uuid;
  v_blocked boolean;
begin
  -- Rien n'est réclamable tant que le délai de grâce court.
  update public.email_outbox set not_before = now() + interval '1 hour'
   where sent_at is null;
  select count(*) into v_claimed from public.claim_pending_emails(50);
  perform pg_temp.check('rien n''est réclamé avant l''échéance', v_claimed = 0);

  -- Échéance atteinte : les envois deviennent réclamables.
  update public.email_outbox set not_before = now() - interval '1 minute', claimed_at = null
   where sent_at is null;
  select count(*) into v_claimed from public.claim_pending_emails(50);
  perform pg_temp.check('les envois échus sont réclamés', v_claimed > 0);

  -- Une seconde réclamation immédiate ne rend rien : le verrou tient.
  select count(*) into v_claimed from public.claim_pending_emails(50);
  perform pg_temp.check('un envoi réclamé n''est pas servi deux fois', v_claimed = 0);

  -- Clôture en succès.
  select id into v_id from public.email_outbox where sent_at is null limit 1;
  perform public.mark_email_sent(v_id);
  perform pg_temp.check('un envoi abouti est marqué expédié',
    (select sent_at from public.email_outbox where id = v_id) is not null);

  -- Clôture en échec : l'envoi redevient réclamable.
  select id into v_id from public.email_outbox where sent_at is null limit 1;
  perform public.mark_email_sent(v_id, 'Fournisseur injoignable');
  select * into v_row from public.email_outbox where id = v_id;
  perform pg_temp.check('un échec n''est pas marqué expédié', v_row.sent_at is null);
  perform pg_temp.check('l''échec est consigné', v_row.last_error = 'Fournisseur injoignable');
  perform pg_temp.check('l''envoi échoué redevient réclamable', v_row.claimed_at is null);

  -- Le travailleur est inaccessible au client : il expose des adresses e-mail.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('b0000000-0000-0000-0000-000000000001',
    'select * from public.claim_pending_emails(10)');
  reset role;
  perform pg_temp.check('claim_pending_emails est INACCESSIBLE au client', v_blocked);

  set local role authenticated;
  v_blocked := pg_temp.fails_as('b0000000-0000-0000-0000-000000000001',
    format('select public.mark_email_sent(%L)', v_id));
  reset role;
  perform pg_temp.check('mark_email_sent est INACCESSIBLE au client', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Message lu pendant le délai de grâce
-- ---------------------------------------------------------------------------
\echo '--- 7. Message lu à temps ---'

do $$
declare v_notif uuid; v_outbox uuid; v_claimed integer;
begin
  delete from public.email_outbox;

  v_notif := public.create_notification(
    'b0000000-0000-0000-0000-000000000001', 'new_message',
    'Nouveau message', 'Vous êtes là ?', '/messages/ghi',
    jsonb_build_object('conversation_id', '44444444-4444-4444-4444-444444444444')
  );

  select id into v_outbox from public.email_outbox where kind = 'new_message';
  update public.email_outbox set not_before = now() - interval '1 minute' where id = v_outbox;

  -- Le destinataire lit la notification avant l'échéance.
  update public.notifications set read_at = now() where id = v_notif;

  select count(*) into v_claimed from public.claim_pending_emails(10);
  perform pg_temp.check(
    'un message lu à temps n''envoie AUCUN e-mail', v_claimed = 0);

  -- Le même mécanisme ne doit pas escamoter les autres types : une annonce
  -- approuvée mérite son courriel même si l'alerte a été vue.
  delete from public.email_outbox;
  v_notif := public.create_notification(
    'b0000000-0000-0000-0000-000000000001', 'ad_approved',
    'Annonce approuvée', 'Elle est en ligne.', '/annonces/x-AB12CD34',
    '{}'::jsonb
  );
  update public.email_outbox set not_before = now() - interval '1 minute';
  update public.notifications set read_at = now() where id = v_notif;

  select count(*) into v_claimed from public.claim_pending_emails(10);
  perform pg_temp.check(
    'une alerte d''annonce lue part quand même', v_claimed = 1);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Abonnement sur le point d'expirer
-- ---------------------------------------------------------------------------
\echo '--- 8. Abonnement expirant ---'

do $$
declare v_plan public.subscription_plans; v_sub uuid; v_sent integer;
begin
  select * into v_plan from public.subscription_plans where price > 0 and is_active
   order by price limit 1;

  insert into public.subscriptions (user_id, plan_id, status, auto_renew,
                                    current_period_start, current_period_end)
  values ('b0000000-0000-0000-0000-000000000002', v_plan.id, 'active', false,
          now() - interval '27 days', now() + interval '2 days')
  returning id into v_sub;

  v_sent := public.notify_expiring_subscriptions();
  perform pg_temp.check('une alerte d''expiration est envoyée', v_sent = 1);
  perform pg_temp.check('l''alerte porte le nom de l''offre',
    exists (select 1 from public.notifications
             where user_id = 'b0000000-0000-0000-0000-000000000002'
               and type = 'subscription_expiring'
               and body like '%' || v_plan.name || '%'));

  -- Le passage quotidien ne doit pas renvoyer la même alerte tous les jours.
  v_sent := public.notify_expiring_subscriptions();
  perform pg_temp.check('le passage suivant ne renvoie pas l''alerte', v_sent = 0);

  -- Un abonnement à renouvellement automatique n'expire pas : rien à signaler.
  update public.subscriptions set auto_renew = true where id = v_sub;
  delete from public.notifications where type = 'subscription_expiring';
  v_sent := public.notify_expiring_subscriptions();
  perform pg_temp.check('un renouvellement automatique ne déclenche AUCUNE alerte',
    v_sent = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Purge
-- ---------------------------------------------------------------------------
\echo '--- 9. Purge ---'

do $$
declare v_purged integer; v_id uuid;
begin
  insert into public.email_outbox (user_id, kind, payload, sent_at, created_at)
  values ('b0000000-0000-0000-0000-000000000001', 'system', '{}'::jsonb,
          now() - interval '10 days', now() - interval '10 days')
  returning id into v_id;

  insert into public.email_outbox (user_id, kind, payload, attempts, created_at)
  values ('b0000000-0000-0000-0000-000000000001', 'system', '{}'::jsonb,
          5, now() - interval '40 days');

  v_purged := public.purge_email_outbox();
  perform pg_temp.check('les envois anciens sont purgés', v_purged = 2);

  -- Un envoi récent en attente survit.
  insert into public.email_outbox (user_id, kind, payload)
  values ('b0000000-0000-0000-0000-000000000001', 'system', '{}'::jsonb);
  v_purged := public.purge_email_outbox();
  perform pg_temp.check('un envoi en attente n''est PAS purgé', v_purged = 0);
end $$;

\echo ''
\echo '  TESTS NOTIFICATIONS : TOUS PASSÉS'
