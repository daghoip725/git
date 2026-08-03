'use client';

/**
 * Photo de profil.
 *
 * Le fichier part directement du navigateur vers le bucket public `avatars`,
 * dans le dossier de l'utilisateur ; seul le chemin résultant est soumis avec
 * le formulaire de profil.
 *
 * Les avatars fournis par Google ou Facebook ne sont volontairement pas repris :
 * ce sont des URL sur des domaines tiers, que la CSP de l'application bloque et
 * qui signaleraient à ces fournisseurs chaque consultation de page.
 */
import { Loader2, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';

import { Avatar } from '@/components/common/Avatar';
import { Alert } from '@/components/ui/Alert';
import { getAvatarUrl, uploadAvatar } from '@/services/storage.service';

export interface AvatarUploaderProps {
  userId: string;
  fullName: string;
  initialPath: string | null;
}

export function AvatarUploader({ userId, fullName, initialPath }: AvatarUploaderProps) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      setPath(await uploadAvatar(file, userId));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'L’envoi a échoué.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Valeur soumise avec le formulaire de profil. */}
      <input type="hidden" name="avatarPath" value={path ?? ''} />

      <span className="text-sm font-medium text-neutral-800">Photo de profil</span>

      <div className="flex items-center gap-4">
        <Avatar name={fullName} src={getAvatarUrl(path)} size={72} />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            {isUploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-3.5" aria-hidden="true" />
            )}
            {isUploading ? 'Envoi…' : 'Changer la photo'}
          </button>

          {path ? (
            <button
              type="button"
              onClick={() => setPath(null)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Retirer
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-neutral-500">JPEG, PNG, WebP ou AVIF. 2 Mo maximum.</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={handleChange}
        className="sr-only"
        aria-label="Choisir une photo de profil"
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
