/**
 * Accès au Supabase Storage pour les photos d'annonces.
 *
 * Les fichiers sont envoyés **directement depuis le navigateur** vers Supabase :
 * cela évite de faire transiter plusieurs mégaoctets par le serveur Next.js et
 * conserve la RLS Storage comme unique point d'autorisation.
 *
 * Convention de chemin : `<user_id>/<listing_id>/<uuid>.<ext>`
 * — le premier segment est vérifié par la politique Storage
 *   (voir `supabase/schema.sql`, section 12).
 */
import { createClient } from '@/lib/supabase/client';
import { publicEnv } from '@/lib/env';
import { ACCEPTED_IMAGE_TYPES, LISTINGS_BUCKET, LISTING_LIMITS } from '@/utils/constants';

/** URL publique d'un objet du bucket des annonces. */
export function getPublicImageUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${LISTINGS_BUCKET}/${storagePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Vérifie type et poids côté client avant tout appel réseau. */
export function validateImageFile(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `« ${file.name} » : format non supporté (JPEG, PNG, WebP ou AVIF).`;
  }
  if (file.size > LISTING_LIMITS.maxImageBytes) {
    const maxMb = Math.round(LISTING_LIMITS.maxImageBytes / 1024 / 1024);
    return `« ${file.name} » : fichier trop lourd (maximum ${maxMb} Mo).`;
  }
  return null;
}

export interface UploadedImage {
  storagePath: string;
  publicUrl: string;
}

/**
 * Envoie une liste de fichiers dans le bucket des annonces.
 *
 * @throws Error si un fichier est invalide ou si l'envoi échoue.
 */
export async function uploadListingImages(
  files: File[],
  userId: string,
  listingId: string,
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
      await removeListingImages(uploaded.map((image) => image.storagePath));
      throw new Error(validationError);
    }

    const extension = EXTENSION_BY_MIME[file.type] ?? 'jpg';
    const storagePath = `${userId}/${listingId}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage.from(LISTINGS_BUCKET).upload(storagePath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      // Nettoyage : on ne laisse pas d'objets orphelins derrière un échec partiel.
      await removeListingImages(uploaded.map((image) => image.storagePath));
      throw new Error(`Échec de l’envoi de « ${file.name} ». Veuillez réessayer.`);
    }

    uploaded.push({ storagePath, publicUrl: getPublicImageUrl(storagePath)! });
  }

  return uploaded;
}

/** Supprime des objets du bucket (best effort, ne lève pas). */
export async function removeListingImages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(LISTINGS_BUCKET).remove(storagePaths);
}

/** Image telle que manipulée par le sélecteur de photos du formulaire. */
export interface UploaderImage {
  storagePath: string;
  url: string;
}

/**
 * Convertit des chemins Storage en images prêtes pour `ImageUploader`.
 * Isomorphe : utilisable depuis un Server Component (page de modification).
 */
export function toUploaderImages(storagePaths: string[]): UploaderImage[] {
  return storagePaths.flatMap((storagePath) => {
    const url = getPublicImageUrl(storagePath);
    return url ? [{ storagePath, url }] : [];
  });
}
