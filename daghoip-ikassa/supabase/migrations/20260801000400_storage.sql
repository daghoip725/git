-- =============================================================================
--  Daghoip Ikassa — 04. Supabase Storage : buckets et politiques
-- =============================================================================
--  Quatre buckets, deux publics et deux privés.
--
--  Convention de chemin commune : le PREMIER SEGMENT est toujours l'identifiant
--  de l'utilisateur propriétaire. Les politiques comparent ce segment à
--  `auth.uid()` : un utilisateur ne peut donc ni écraser ni supprimer les
--  fichiers d'un autre, quelle que soit la requête envoyée.
--
--    ad-images/             <user_id>/<ad_id>/<uuid>.<ext>
--    avatars/               <user_id>/<uuid>.<ext>
--    message-attachments/   <user_id>/<conversation_id>/<uuid>.<ext>
--    verification-docs/     <user_id>/<uuid>.<ext>
-- =============================================================================

-- =============================================================================
-- 1. Création des buckets
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Photos d'annonces : publiques (indexables, servies par le CDN), 5 Mo.
  ('ad-images', 'ad-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),

  -- Avatars : publics, 2 Mo.
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),

  -- Pièces jointes de messagerie : PRIVÉES (URL signées uniquement), 5 Mo.
  ('message-attachments', 'message-attachments', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),

  -- Justificatifs de vérification : PRIVÉS, lisibles par le seul staff, 10 Mo.
  ('verification-docs', 'verification-docs', false, 10485760,
   array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================================
-- 2. Bucket `ad-images`
-- =============================================================================
drop policy if exists ad_images_public_read on storage.objects;
create policy ad_images_public_read
  on storage.objects for select
  using (bucket_id = 'ad-images');

drop policy if exists ad_images_owner_insert on storage.objects;
create policy ad_images_owner_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ad-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_account()
  );

drop policy if exists ad_images_owner_update on storage.objects;
create policy ad_images_owner_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'ad-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'ad-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists ad_images_owner_delete on storage.objects;
create policy ad_images_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ad-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- =============================================================================
-- 3. Bucket `avatars`
-- =============================================================================
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 4. Bucket `message-attachments` (privé)
-- =============================================================================
--  Lecture réservée aux deux participants du fil : le deuxième segment du
--  chemin porte l'identifiant de la conversation, qu'on recoupe avec la table
--  `conversations`.
-- -----------------------------------------------------------------------------
drop policy if exists message_attachments_participant_read on storage.objects;
create policy message_attachments_participant_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversations c
       where c.id::text = (storage.foldername(name))[2]
         and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

drop policy if exists message_attachments_owner_insert on storage.objects;
create policy message_attachments_owner_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.conversations c
       where c.id::text = (storage.foldername(name))[2]
         and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

drop policy if exists message_attachments_owner_delete on storage.objects;
create policy message_attachments_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 5. Bucket `verification-docs` (privé, sensible)
-- =============================================================================
--  L'utilisateur dépose ses justificatifs et peut les relire ; seul le staff
--  peut également y accéder, pour instruire la demande de vérification.
-- -----------------------------------------------------------------------------
drop policy if exists verification_docs_read on storage.objects;
create policy verification_docs_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

drop policy if exists verification_docs_owner_insert on storage.objects;
create policy verification_docs_owner_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists verification_docs_owner_delete on storage.objects;
create policy verification_docs_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- =============================================================================
-- 6. Nettoyage : supprimer une annonce supprime ses fichiers
-- =============================================================================
--  Sans cela, les objets Storage deviennent orphelins et continuent d'être
--  facturés. Le trigger s'exécute côté base, donc y compris pour les
--  suppressions faites hors de l'application.
-- -----------------------------------------------------------------------------
create or replace function public.delete_ad_storage_objects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from storage.objects
   where bucket_id = 'ad-images'
     and name like '%/' || old.id::text || '/%';

  return old;
end;
$$;

drop trigger if exists ads_delete_storage on public.ads;
create trigger ads_delete_storage
  after delete on public.ads
  for each row execute function public.delete_ad_storage_objects();

-- Idem pour un compte supprimé : avatar et justificatifs partent avec lui.
create or replace function public.delete_user_storage_objects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from storage.objects
   where bucket_id in ('avatars', 'verification-docs', 'ad-images', 'message-attachments')
     and (storage.foldername(name))[1] = old.id::text;

  return old;
end;
$$;

drop trigger if exists users_delete_storage on public.users;
create trigger users_delete_storage
  after delete on public.users
  for each row execute function public.delete_user_storage_objects();
