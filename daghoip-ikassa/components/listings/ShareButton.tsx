'use client';

/**
 * Partage d'une annonce : API Web Share sur mobile, copie du lien en repli.
 */
import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';

export interface ShareButtonProps {
  title: string;
  url: string;
}

export function ShareButton({ title, url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Partage annulé par l'utilisateur : on bascule sur la copie.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé) : rien à faire.
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
    >
      {copied ? (
        <>
          <Check className="size-4.5 text-emerald-600" aria-hidden="true" />
          Lien copié
        </>
      ) : (
        <>
          <Share2 className="size-4.5" aria-hidden="true" />
          Partager
        </>
      )}
    </button>
  );
}
