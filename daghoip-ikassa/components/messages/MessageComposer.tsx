'use client';

/**
 * Saisie d'un message : texte, émojis et photo.
 *
 * L'envoi passe par la RPC `send_message` appelée **depuis le navigateur** —
 * même chemin que le reste de l'application, RLS comprise — plutôt que par une
 * Server Action : dans une messagerie temps réel, un aller-retour par le
 * serveur Next.js ne servirait qu'à retarder l'affichage de son propre message.
 *
 * La photo part directement vers Supabase Storage ; seul son chemin accompagne
 * le message, et le trigger d'insertion vérifie qu'il appartient bien à
 * l'expéditeur et à cette conversation.
 */
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { EmojiPicker } from '@/components/messages/EmojiPicker';
import { Alert } from '@/components/ui/Alert';
import { createClient } from '@/lib/supabase/client';
import { uploadMessageAttachment, validateImageFile } from '@/services/storage.service';
import { MESSAGE_LIMITS } from '@/utils/constants';

export interface MessageComposerProps {
  conversationId: string;
  currentUserId: string;
  /** Fil clos (blocage) : la saisie est remplacée par l'explication. */
  disabledReason?: string | null;
  /** Appelé dès la soumission, pour l'affichage optimiste. */
  onOptimisticSend: (draft: { body: string; localPreviewUrl?: string }) => string;
  /** Appelé si l'envoi échoue, pour retirer le message optimiste. */
  onSendFailed: (key: string) => void;
}

export function MessageComposer({
  conversationId,
  currentUserId,
  disabledReason,
  onOptimisticSend,
  onSendFailed,
}: MessageComposerProps) {
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // L'URL d'aperçu est un objet mémoire : la libérer évite une fuite à chaque
  // photo sélectionnée puis retirée.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody((current) => current + emoji);
      return;
    }

    // Insertion à la position du curseur, pas en fin de champ.
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody((current) => current.slice(0, start) + emoji + current.slice(end));

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validationError = validateImageFile(file, MESSAGE_LIMITS.attachmentMaxBytes);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSending) return;

    const trimmed = body.trim();
    if (!trimmed && !photo) return;

    setIsSending(true);
    setError(null);

    const optimisticKey = onOptimisticSend({
      body: trimmed,
      localPreviewUrl: photo?.previewUrl,
    });

    // Le champ se vide tout de suite : l'utilisateur enchaîne sans attendre.
    setBody('');
    const pendingPhoto = photo;
    setPhoto(null);

    try {
      const supabase = createClient();

      let attachmentPath: string | null = null;
      if (pendingPhoto) {
        attachmentPath = await uploadMessageAttachment(
          pendingPhoto.file,
          currentUserId,
          conversationId,
        );
      }

      const { error: sendError } = await supabase.rpc('send_message', {
        p_conversation_id: conversationId,
        p_body: trimmed,
        p_attachment_path: attachmentPath,
      });

      if (sendError) throw new Error(sendError.message);
    } catch (cause) {
      onSendFailed(optimisticKey);
      // Les messages levés par la base sont écrits pour être lus : ils
      // n'exposent ni requête ni identifiant.
      setError(cause instanceof Error ? cause.message : 'Impossible d’envoyer le message.');
      // La saisie est rendue à l'utilisateur plutôt que perdue.
      setBody(trimmed);
      if (pendingPhoto) setPhoto(pendingPhoto);
    } finally {
      setIsSending(false);
    }
  }

  if (disabledReason) {
    return (
      <div className="sticky bottom-16 border-t border-neutral-200 bg-white/95 py-3 backdrop-blur md:bottom-0">
        <Alert tone="warning">{disabledReason}</Alert>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      // `bottom-16` sur mobile : la barre d'onglets est fixée en bas d'écran,
      // une barre collante à `bottom-0` passerait derrière elle.
      className="sticky bottom-16 space-y-2 border-t border-neutral-200 bg-white/95 py-3 backdrop-blur md:bottom-0"
    >
      {photo ? (
        <div className="relative inline-block">
          <Image
            src={photo.previewUrl}
            alt="Photo à envoyer"
            width={96}
            height={96}
            unoptimized
            className="size-24 rounded-lg border border-neutral-200 object-cover"
          />
          <button
            type="button"
            onClick={clearPhoto}
            aria-label="Retirer la photo"
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-neutral-900/80 text-white transition-colors hover:bg-neutral-900"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-1">
        <EmojiPicker onSelect={insertEmoji} />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Joindre une photo"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          <ImagePlus className="size-5" aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={handlePhoto}
          className="hidden"
        />

        <label htmlFor="message-body" className="sr-only">
          Votre message
        </label>
        <textarea
          ref={textareaRef}
          id="message-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Entrée envoie, Maj+Entrée passe à la ligne : convention de
            // messagerie. Sur mobile, le clavier propose un vrai retour à la
            // ligne et le bouton reste le chemin normal.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit(event);
            }
          }}
          rows={2}
          maxLength={MESSAGE_LIMITS.bodyMax}
          placeholder="Écrivez votre message…"
          className="min-h-11 flex-1 resize-y rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
        />

        <button
          type="submit"
          disabled={isSending || (!body.trim() && !photo)}
          aria-label="Envoyer"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSending ? (
            <Loader2 className="size-4.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <p className="text-xs text-neutral-500">
        Ne communiquez jamais de code Mobile Money par messagerie.
      </p>
    </form>
  );
}
