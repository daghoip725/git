'use client';

/**
 * Sélecteur de photos d'une annonce.
 *
 * Les fichiers sont envoyés **directement** vers Supabase Storage (le serveur
 * Next.js ne relaie jamais les octets) ; seuls les chemins résultants sont
 * transmis à la Server Action, via des `<input type="hidden" name="imagePaths">`.
 */
import { GripVertical, ImagePlus, Loader2, Star, X } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState, type ChangeEvent } from 'react';

import { Alert } from '@/components/ui/Alert';
import {
  removeAdImages,
  uploadAdImages,
  validateImageFile,
  type UploaderImage,
} from '@/services/storage.service';
import { cn } from '@/utils/cn';
import { ACCEPTED_IMAGE_TYPES, LISTING_LIMITS } from '@/utils/constants';

export interface ImageUploaderProps {
  userId: string;
  /** Dossier de destination : identifiant (existant ou pré-généré) de l'annonce. */
  listingId: string;
  initialImages?: UploaderImage[];
  onChange?: (images: UploaderImage[]) => void;
}

export function ImageUploader({
  userId,
  listingId,
  initialImages = [],
  onChange,
}: ImageUploaderProps) {
  const [images, setImages] = useState<UploaderImage[]>(initialImages);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function update(next: UploaderImage[]) {
    setImages(next);
    onChange?.(next);
  }

  async function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Permet de re-sélectionner le même fichier après une suppression.
    event.target.value = '';
    if (files.length === 0) return;

    setError(null);

    const remaining = LISTING_LIMITS.maxImages - images.length;
    if (files.length > remaining) {
      setError(
        `Vous pouvez ajouter ${remaining} photo${remaining > 1 ? 's' : ''} supplémentaire${remaining > 1 ? 's' : ''} (maximum ${LISTING_LIMITS.maxImages}).`,
      );
      return;
    }

    for (const file of files) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsUploading(true);
    try {
      const uploaded = await uploadAdImages(files, userId, listingId);
      update([
        ...images,
        ...uploaded.map((item) => ({ storagePath: item.storagePath, url: item.publicUrl })),
      ]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'L’envoi des photos a échoué. Veuillez réessayer.',
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove(storagePath: string) {
    update(images.filter((image) => image.storagePath !== storagePath));
    await removeAdImages([storagePath]);
  }

  /** Déplace une photo dans l'ordre d'affichage (la première est la couverture). */
  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    update(next);
  }

  const canAddMore = images.length < LISTING_LIMITS.maxImages;

  return (
    <div className="space-y-3">
      {/* Chemins transmis à la Server Action, dans l'ordre d'affichage. */}
      {images.map((image) => (
        <input key={image.storagePath} type="hidden" name="imagePaths" value={image.storagePath} />
      ))}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((image, index) => (
          <figure
            key={image.storagePath}
            className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
          >
            <Image
              src={image.url}
              alt={`Photo ${index + 1}`}
              fill
              sizes="(max-width: 640px) 33vw, 25vw"
              className="object-cover"
            />

            {index === 0 ? (
              <figcaption className="absolute top-1 left-1 flex items-center gap-1 rounded bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold text-brand-900">
                <Star className="size-3 fill-current" aria-hidden="true" />
                Couverture
              </figcaption>
            ) : null}

            <button
              type="button"
              onClick={() => handleRemove(image.storagePath)}
              aria-label={`Supprimer la photo ${index + 1}`}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-neutral-900/70 text-white transition-colors hover:bg-red-600"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>

            {images.length > 1 ? (
              <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label="Déplacer vers la gauche"
                  className="flex size-6 items-center justify-center rounded bg-white/90 text-neutral-700 disabled:opacity-30"
                >
                  <GripVertical className="size-3.5 rotate-90" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === images.length - 1}
                  aria-label="Déplacer vers la droite"
                  className="flex size-6 items-center justify-center rounded bg-white/90 text-neutral-700 disabled:opacity-30"
                >
                  <GripVertical className="size-3.5 -rotate-90" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </figure>
        ))}

        {canAddMore ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed',
              'border-neutral-300 text-neutral-500 transition-colors',
              'hover:border-brand-500 hover:text-brand-700 disabled:opacity-60',
            )}
          >
            {isUploading ? (
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-6" aria-hidden="true" />
            )}
            <span className="text-xs font-medium">{isUploading ? 'Envoi…' : 'Ajouter'}</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        onChange={handleSelect}
        className="sr-only"
        aria-label="Sélectionner des photos"
      />

      <p className="text-xs text-neutral-500">
        Jusqu’à {LISTING_LIMITS.maxImages} photos,{' '}
        {Math.round(LISTING_LIMITS.maxImageBytes / 1024 / 1024)} Mo maximum chacune. La première
        photo sert de couverture. Les annonces avec photos reçoivent nettement plus de contacts.
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
