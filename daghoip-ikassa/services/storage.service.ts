/**
 * Accès au Supabase Storage.
 *
 * Quatre buckets (voir `supabase/migrations/…_storage.sql`) :
 *   ad-images/           public   <user_id>/<ad_id>/<uuid>.<ext>
 *   avatars/             public   <user_id>/<uuid>.<ext>
 *   message-attachments/ privé    <user_id>/<conversation_id>/<uuid>.<ext>
 *   verification-docs/   privé    <user_id>/<uuid>.<ext>
 *
 * Les fichiers sont envoyés **directement depuis le navigateur** : cela évite
 * de faire transiter plusieurs mégaoctets par le serveur Next.js et laisse la
 * RLS Storage comme unique point d'autorisation.
 *
 * Module isomorphe : les helpers d'URL sont utilisables côté serveur, les
 * fonctions d'envoi uniquement depuis un composant client.
 */
import { createClient } from '@/lib/supabase/client';
import { publicEnv } from '@/lib/env';
import {
  ACCEPTED_IMAGE_TYPES,
  AVATARS_BUCKET,
  AD_IMAGES_BUCKET,
  LISTING_LIMITS,
  MESSAGE_ATTACHMENTS_BUCKET,
  MESSAGE_LIMITS,
} from '@/utils/constants';

/* -------------------------------------------------------------------------- */
/*  URLs publiques                                                            */
/* -------------------------------------------------------------------------- */

function buildPublicUrl(bucket: string, storagePath: string): string {
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

/** URL publique d'une photo d'annonce. */
export function getAdImageUrl(storagePath: string | null | undefined): string | null {
  return storagePath ? buildPublicUrl(AD_IMAGES_BUCKET, storagePath) : null;
}

/** URL publique d'un avatar. */
export function getAvatarUrl(storagePath: string | null | undefined): string | null {
  return storagePath ? buildPublicUrl(AVATARS_BUCKET, storagePath) : null;
}

/**
 * URL signée d'un objet d'un bucket privé (pièce jointe, justificatif).
 * À appeler côté serveur : la RLS Storage vérifie l'accès de l'appelant.
 */
export async function createSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  return error ? null : (data?.signedUrl ?? null);
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Vérifie type et poids côté client, avant tout appel réseau. */
export function validateImageFile(
  file: File,
  maxBytes = LISTING_LIMITS.maxImageBytes,
): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `« ${file.name} » : format non supporté (JPEG, PNG, WebP ou AVIF).`;
  }
  if (file.size > maxBytes) {
    return `« ${file.name} » : fichier trop lourd (maximum ${Math.round(maxBytes / 1024 / 1024)} Mo).`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Envoi (client uniquement)                                                 */
/* -------------------------------------------------------------------------- */

export interface UploadedImage {
  storagePath: string;
  publicUrl: string;
}

/**
 * Envoie des photos d'annonce dans `ad-images`.
 * En cas d'échec partiel, les fichiers déjà envoyés sont supprimés : pas
 * d'objet orphelin facturé.
 *
 * @throws Error si un fichier est invalide ou si l'envoi échoue.
 */
export async function uploadAdImages(
  files: File[],
  userId: string,
  adId: string,
): Promise<UploadedImage[]> {
  if (files.length === 0) return [];
  if (files.length > LISTING_LIMITS.maxImages) {
    throw new Error(`Vous ne pouvez pas envoyer plus de ${LISTING_LIMITS.maxImages} photos.`);
  }

  const supabase = createClient();
  const uploaded: UploadedImage[] = [];

  for (const file of files) {
    const validationError = validateImageFile(file);
    if (validationError) {
      await removeAdImages(uploaded.map((image) => image.storagePath));
      throw new Error(validationError);
    }

    const extension = EXTENSION_BY_MIME[file.type] ?? 'jpg';
    const storagePath = `${userId}/${adId}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage.from(AD_IMAGES_BUCKET).upload(storagePath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      await removeAdImages(uploaded.map((image) => image.storagePath));
      throw new Error(`Échec de l’envoi de « ${file.name} ». Veuillez réessayer.`);
    }

    uploaded.push({ storagePath, publicUrl: getAdImageUrl(storagePath)! });
  }

  return uploaded;
}

/** Supprime des photos d'annonce (best effort, ne lève pas). */
export async function removeAdImages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(AD_IMAGES_BUCKET).remove(storagePaths);
}

/**
 * Envoie un avatar et renvoie son chemin Storage.
 * L'ancien avatar doit être supprimé par l'appelant après mise à jour du profil.
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const validationError = validateImageFile(file, 2 * 1024 * 1024);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const extension = EXTENSION_BY_MIME[file.type] ?? 'jpg';
  const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error('Échec de l’envoi de l’avatar. Veuillez réessayer.');
  return storagePath;
}

/**
 * Envoie une photo dans un fil de discussion.
 *
 * Convention de chemin `<sender_id>/<conversation_id>/<uuid>.<ext>` : elle est
 * exigée à la fois par la politique Storage et par le trigger d'insertion d'un
 * message. Le bucket est **privé** — la lecture passera par une URL signée.
 */
export async function uploadMessageAttachment(
  file: File,
  userId: string,
  conversationId: string,
): Promise<string> {
  const validationError = validateImageFile(file, MESSAGE_LIMITS.attachmentMaxBytes);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const extension = EXTENSION_BY_MIME[file.type] ?? 'jpg';
  const storagePath = `${userId}/${conversationId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (error) throw new Error('Échec de l’envoi de la photo. Veuillez réessayer.');
  return storagePath;
}

/**
 * URL signée d'une pièce jointe, demandée **depuis le navigateur**.
 *
 * Les messages arrivant en temps réel n'ont pas transité par le serveur : ils
 * ne peuvent donc pas apporter d'URL signée. Le client la demande lui-même, et
 * la politique Storage vérifie qu'il participe bien à la conversation.
 */
export async function signMessageAttachment(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  return error ? null : (data?.signedUrl ?? null);
}

/* -------------------------------------------------------------------------- */
/*  Utilitaires                                                               */
/* -------------------------------------------------------------------------- */

/** Image telle que manipulée par le sélecteur de photos du formulaire. */
export interface UploaderImage {
  storagePath: string;
  url: string;
}

/**
 * Convertit des chemins Storage en images prêtes pour `ImageUploader`.
 * Isomorphe : utilisable depuis un Server Component.
 */
export function toUploaderImages(storagePaths: string[]): UploaderImage[] {
  return storagePaths.flatMap((storagePath) => {
    const url = getAdImageUrl(storagePath);
    return url ? [{ storagePath, url }] : [];
  });
}
