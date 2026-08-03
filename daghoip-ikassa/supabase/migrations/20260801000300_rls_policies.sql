-- =============================================================================
--  Daghoip Ikassa — 03. Row Level Security, politiques et privilèges
-- =============================================================================
--  Deux mécanismes complémentaires :
--
--   1. RLS  → décide QUELLES LIGNES sont accessibles.
--   2. GRANT→ décide QUELLES COLONNES sont lisibles / modifiables.
--
--  La combinaison des deux permet, par exemple, de rendre une ligne de
--  `users` visible publiquement tout en gardant `phone` privé, ou d'autoriser
--  un vendeur à modifier son annonce sans pouvoir toucher `is_featured`.
--
--  Le rôle `service_role` (clé secrète, serveur uniquement) contourne la RLS
--  par conception : il sert aux callbacks de paiement et à la modération.
-- =============================================================================

-- =============================================================================
-- 1. Activation de la RLS sur toutes les tables
-- =============================================================================
alter table public.users              enable row level security;
alter table public.categories         enable row level security;
alter table public.ads                enable row level security;
alter table public.ad_images          enable row level security;
alter table public.favorites          enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.notifications      enable row level security;
alter table public.reviews            enable row level security;
alter table public.reports            enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.payments           enable row level security;

-- =============================================================================
-- 2. USERS
-- =============================================================================
--  Toutes les lignes sont visibles (un vendeur est public), mais seules les
--  colonnes non sensibles sont accordées en lecture — voir section 14.
-- -----------------------------------------------------------------------------
drop policy if exists users_select_public on public.users;
create policy users_select_public
  on public.users for select
  using (status <> 'deleted' or id = auth.uid() or public.is_staff());

drop policy if exists users_insert_self on public.users;
create policy users_insert_self
  on public.users for insert
  to authenticated
  with check (id = auth.uid());

-- `role`, `status` et `is_verified` sont hors du GRANT UPDATE : aucune
-- élévation de privilège possible, même par requête forgée.
drop policy if exists users_update_self on public.users;
create policy users_update_self
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_update_staff on public.users;
create policy users_update_staff
  on public.users for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- 3. CATEGORIES
-- =============================================================================
drop policy if exists categories_select_active on public.categories;
create policy categories_select_active
  on public.categories for select
  using (is_active or public.is_staff());

drop policy if exists categories_write_staff on public.categories;
create policy categories_write_staff
  on public.categories for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- 4. ADS
-- =============================================================================
--  Public : annonces publiées ou vendues (l'historique reste consultable).
--  Vendeur : toutes ses annonces, brouillons et refus compris.
-- -----------------------------------------------------------------------------
drop policy if exists ads_select_public on public.ads;
create policy ads_select_public
  on public.ads for select
  using (
    status in ('published', 'sold')
    or seller_id = auth.uid()
    or public.is_staff()
  );

drop policy if exists ads_insert_own on public.ads;
create policy ads_insert_own
  on public.ads for insert
  to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_active_account()
    and status in ('draft', 'pending_review', 'published')
  );

drop policy if exists ads_update_own on public.ads;
create policy ads_update_own
  on public.ads for update
  to authenticated
  using (seller_id = auth.uid() and public.is_active_account())
  with check (seller_id = auth.uid());

drop policy if exists ads_update_staff on public.ads;
create policy ads_update_staff
  on public.ads for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ads_delete_own on public.ads;
create policy ads_delete_own
  on public.ads for delete
  to authenticated
  using (seller_id = auth.uid() or public.is_staff());

-- =============================================================================
-- 5. AD_IMAGES
-- =============================================================================
drop policy if exists ad_images_select_public on public.ad_images;
create policy ad_images_select_public
  on public.ad_images for select
  using (
    exists (
      select 1 from public.ads a
       where a.id = ad_id
         and (a.status in ('published', 'sold') or a.seller_id = auth.uid() or public.is_staff())
    )
  );

drop policy if exists ad_images_write_owner on public.ad_images;
create policy ad_images_write_owner
  on public.ad_images for all
  to authenticated
  using (
    exists (select 1 from public.ads a where a.id = ad_id and a.seller_id = auth.uid())
    or public.is_staff()
  )
  with check (
    exists (select 1 from public.ads a where a.id = ad_id and a.seller_id = auth.uid())
    or public.is_staff()
  );

-- =============================================================================
-- 6. FAVORITES
-- =============================================================================
drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own
  on public.favorites for select
  to authenticated
  using (user_id = auth.uid());

-- On ne peut mettre en favori qu'une annonce réellement visible.
drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own
  on public.favorites for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.ads a where a.id = ad_id and a.status in ('published', 'sold')
    )
  );

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own
  on public.favorites for delete
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- 7. CONVERSATIONS
-- =============================================================================
drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant
  on public.conversations for select
  to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_staff());

-- Seul un acheteur ouvre un fil, sur une annonce publiée acceptant la
-- messagerie, et le vendeur enregistré doit être celui de l'annonce.
drop policy if exists conversations_insert_buyer on public.conversations;
create policy conversations_insert_buyer
  on public.conversations for insert
  to authenticated
  with check (
    buyer_id = auth.uid()
    and public.is_active_account()
    and exists (
      select 1 from public.ads a
       where a.id = conversations.ad_id
         and a.status = 'published'
         and a.allow_messages
         -- Qualification obligatoire : `ads` possède aussi une colonne
         -- `seller_id`, qui masquerait celle de la ligne insérée.
         and a.seller_id = conversations.seller_id
         and a.seller_id <> auth.uid()
    )
  );

-- Le GRANT UPDATE ne porte que sur les indicateurs d'archivage.
drop policy if exists conversations_update_participant on public.conversations;
create policy conversations_update_participant
  on public.conversations for update
  to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid())
  with check (buyer_id = auth.uid() or seller_id = auth.uid());

-- =============================================================================
-- 8. MESSAGES
-- =============================================================================
drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
    or public.is_staff()
  );

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_account()
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- Le GRANT UPDATE ne porte que sur `read_at`, et seul le destinataire peut
-- marquer un message comme lu.
drop policy if exists messages_update_recipient on public.messages;
create policy messages_update_recipient
  on public.messages for update
  to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- =============================================================================
-- 9. NOTIFICATIONS
-- =============================================================================
--  Aucun INSERT n'est accordé au client : les notifications sont créées
--  exclusivement par `public.create_notification()` (SECURITY DEFINER) et par
--  le rôle service_role.
-- -----------------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- 10. REVIEWS
-- =============================================================================
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public
  on public.reviews for select
  using (
    status = 'published'
    or reviewer_id = auth.uid()
    or reviewee_id = auth.uid()
    or public.is_staff()
  );

-- Un avis suppose une mise en relation réelle (conversation avec échange).
drop policy if exists reviews_insert_author on public.reviews;
create policy reviews_insert_author
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and reviewer_id <> reviewee_id
    and public.is_active_account()
    and public.can_review(auth.uid(), reviewee_id, ad_id)
  );

-- L'auteur corrige son avis ; le destinataire ne peut qu'y répondre
-- (colonnes `reply` / `replied_at`, cf. GRANT).
drop policy if exists reviews_update_author on public.reviews;
create policy reviews_update_author
  on public.reviews for update
  to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

drop policy if exists reviews_update_reviewee on public.reviews;
create policy reviews_update_reviewee
  on public.reviews for update
  to authenticated
  using (reviewee_id = auth.uid())
  with check (reviewee_id = auth.uid());

drop policy if exists reviews_moderate_staff on public.reviews;
create policy reviews_moderate_staff
  on public.reviews for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- 11. REPORTS
-- =============================================================================
drop policy if exists reports_insert_authenticated on public.reports;
create policy reports_insert_authenticated
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid() and public.is_active_account());

drop policy if exists reports_select_own_or_staff on public.reports;
create policy reports_select_own_or_staff
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_staff());

drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff
  on public.reports for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- =============================================================================
-- 12. SUBSCRIPTION_PLANS
-- =============================================================================
drop policy if exists subscription_plans_select_active on public.subscription_plans;
create policy subscription_plans_select_active
  on public.subscription_plans for select
  using (is_active or public.is_staff());

drop policy if exists subscription_plans_write_admin on public.subscription_plans;
create policy subscription_plans_write_admin
  on public.subscription_plans for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- 13. SUBSCRIPTIONS et PAYMENTS
-- =============================================================================
--  Règle d'or : un utilisateur ne CRÉE jamais son abonnement ni son paiement
--  depuis le navigateur — sinon il fixerait lui-même le montant ou l'offre.
--  Ces écritures appartiennent au serveur (service_role), à la réception du
--  callback de l'opérateur Mobile Money.
--  Le client peut seulement lire, et demander la résiliation en fin de période.
-- -----------------------------------------------------------------------------
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists subscriptions_cancel_own on public.subscriptions;
create policy subscriptions_cancel_own
  on public.subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own
  on public.payments for select
  to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Aucune politique INSERT/UPDATE/DELETE : le client ne peut pas écrire.

-- =============================================================================
-- 14. Privilèges (deuxième ligne de défense, au niveau des colonnes)
-- =============================================================================
grant usage on schema public to anon, authenticated;

-- --- USERS -------------------------------------------------------------------
revoke all on public.users from anon, authenticated;
-- `phone`, `whatsapp` et `district` restent privés : ils ne sont pas listés.
grant select (
  id, username, full_name, avatar_path, city, province, bio,
  is_professional, business_name, is_verified, role, status,
  rating_average, rating_count, ads_count, last_seen_at, created_at
) on public.users to anon, authenticated;
grant insert on public.users to authenticated;
-- `role`, `status`, `is_verified` et les compteurs sont volontairement absents.
grant update (
  username, full_name, phone, whatsapp, city, province, district,
  avatar_path, bio, is_professional, business_name, last_seen_at
) on public.users to authenticated;

-- --- CATEGORIES --------------------------------------------------------------
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated; -- RLS : staff

-- --- ADS ---------------------------------------------------------------------
revoke all on public.ads from anon, authenticated;
grant select on public.ads to anon, authenticated;
-- L'INSERT est lui aussi restreint par colonnes : référence, slug, compteurs,
-- mise en avant et dates de cycle de vie sont posés par le trigger, pas par
-- le client.
grant insert (
  id, seller_id, category_id, title, description, price, price_type, currency,
  condition, city, province, district, latitude, longitude,
  contact_phone, contact_whatsapp, allow_messages, status
) on public.ads to authenticated;
-- Compteurs, mise en avant, référence et vendeur : non modifiables.
grant update (
  title, description, category_id, price, price_type, condition,
  city, province, district, latitude, longitude,
  contact_phone, contact_whatsapp, allow_messages, status, expires_at
) on public.ads to authenticated;
grant delete on public.ads to authenticated;

-- --- AD_IMAGES ---------------------------------------------------------------
revoke all on public.ad_images from anon, authenticated;
grant select on public.ad_images to anon, authenticated;
grant insert, update, delete on public.ad_images to authenticated;

-- --- FAVORITES ---------------------------------------------------------------
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- --- CONVERSATIONS -----------------------------------------------------------
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
-- Seules les trois colonnes d'identité du fil : l'aperçu et les compteurs sont
-- alimentés par trigger.
grant insert (ad_id, buyer_id, seller_id) on public.conversations to authenticated;
-- Seul l'archivage est modifiable : aperçu et compteurs sont tenus par trigger.
grant update (buyer_archived, seller_archived) on public.conversations to authenticated;

-- --- MESSAGES ----------------------------------------------------------------
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
-- `read_at` est exclu de l'INSERT : un message ne naît jamais « déjà lu ».
grant insert (conversation_id, sender_id, body, attachment_path)
  on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- --- NOTIFICATIONS -----------------------------------------------------------
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Pas d'INSERT : réservé à public.create_notification() et à service_role.

-- --- REVIEWS -----------------------------------------------------------------
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
-- L'auteur ajuste sa note/son commentaire, l'évalué ajoute une réponse.
grant update (rating, comment, reply, replied_at, status) on public.reviews to authenticated;
grant delete on public.reviews to authenticated; -- RLS : staff uniquement

-- --- REPORTS -----------------------------------------------------------------
revoke all on public.reports from anon, authenticated;
grant select, insert on public.reports to authenticated;
grant update (status, resolved_by, resolved_at, resolution_note)
  on public.reports to authenticated; -- RLS : staff uniquement

-- --- OFFRES ------------------------------------------------------------------
revoke all on public.subscription_plans from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;
grant insert, update, delete on public.subscription_plans to authenticated; -- RLS : admin

-- --- ABONNEMENTS -------------------------------------------------------------
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
-- Résiliation en fin de période : rien d'autre.
grant update (cancel_at_period_end, auto_renew) on public.subscriptions to authenticated;

-- --- PAIEMENTS ---------------------------------------------------------------
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
-- Aucune écriture : les paiements sont créés côté serveur (service_role).

-- =============================================================================
-- 15. Droits d'exécution des fonctions
-- =============================================================================
--  Par défaut PostgreSQL accorde EXECUTE à PUBLIC : on révoque puis on
--  ré-accorde explicitement, fonction par fonction.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Lecture publique
grant execute on function public.search_ads(
  text, text, text, text, bigint, bigint,
  public.ad_condition, public.price_type, uuid, boolean, text, integer, integer
) to anon, authenticated;
grant execute on function public.suggest_ads(text, integer)      to anon, authenticated;
grant execute on function public.increment_ad_views(uuid)        to anon, authenticated;
grant execute on function public.is_staff()                      to anon, authenticated;
grant execute on function public.is_admin()                      to anon, authenticated;
grant execute on function public.current_user_role()             to anon, authenticated;
grant execute on function public.immutable_unaccent(text)        to anon, authenticated;

-- Actions authentifiées
grant execute on function public.get_my_profile()                    to authenticated;
grant execute on function public.is_active_account()                 to authenticated;
grant execute on function public.toggle_favorite(uuid)               to authenticated;
grant execute on function public.get_or_create_conversation(uuid)    to authenticated;
grant execute on function public.send_message(uuid, text)            to authenticated;
grant execute on function public.mark_conversation_read(uuid)        to authenticated;
grant execute on function public.mark_notifications_read(uuid[])     to authenticated;
grant execute on function public.unread_notifications_count()        to authenticated;
grant execute on function public.effective_plan(uuid)                to authenticated;
grant execute on function public.ad_quota(uuid)                      to authenticated;
grant execute on function public.can_review(uuid, uuid, uuid)        to authenticated;

-- Les fonctions de maintenance (expire_ads, purge_old_notifications, …) et
-- create_notification ne sont accordées à personne : elles restent réservées
-- au propriétaire de la base, à service_role et aux tâches pg_cron.
