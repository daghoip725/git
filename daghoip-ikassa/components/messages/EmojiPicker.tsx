'use client';

/**
 * Sélecteur d'émojis.
 *
 * Une liste **curated** plutôt qu'un catalogue complet : les bibliothèques
 * d'émojis pèsent plusieurs centaines de kilo-octets pour un usage qui, dans
 * une messagerie de petites annonces, tient en quelques dizaines de symboles.
 * Ceux retenus couvrent la négociation, la politesse et le rendez-vous — ce
 * dont on se sert vraiment pour acheter un canapé.
 *
 * Les émojis sont du texte : rien n'est chargé, rien n'est rendu en HTML.
 */
import { Smile } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/utils/cn';

const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Réactions',
    emojis: ['😀', '😃', '😄', '😊', '🙂', '😉', '😍', '🤩', '😎', '🤔', '😅', '😂', '🙃', '😴'],
  },
  {
    label: 'Accord et politesse',
    emojis: ['👍', '👌', '🙏', '👋', '🤝', '💪', '✅', '❤️', '🔥', '✨', '🎉', '👏'],
  },
  {
    label: 'Négociation',
    emojis: ['💰', '💵', '🏷️', '📉', '📈', '🤑', '🧾', '🆗', '❓', '❗', '⚠️', '❌'],
  },
  {
    label: 'Rendez-vous',
    emojis: ['📍', '🗺️', '🚗', '🛵', '🚕', '🏠', '📅', '⏰', '📞', '💬', '📷', '📦'],
  },
];

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ onSelect, className }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à Échap : un panneau flottant qui reste
  // ouvert derrière le clavier mobile gêne plus qu'il n'aide.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label="Insérer un émoji"
        className={cn(
          'flex size-11 items-center justify-center rounded-lg transition-colors',
          isOpen ? 'bg-brand-50 text-brand-800' : 'text-neutral-500 hover:bg-neutral-100',
        )}
      >
        <Smile className="size-5" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Émojis"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-72 overflow-y-auto rounded-xl border border-neutral-200 bg-card p-3 shadow-xl"
        >
          {GROUPS.map((group) => (
            <section key={group.label} className="mb-3 last:mb-0">
              <h3 className="mb-1.5 text-xs font-semibold text-neutral-500">{group.label}</h3>
              <div className="grid grid-cols-7 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelect(emoji);
                      setIsOpen(false);
                    }}
                    aria-label={emoji}
                    className="flex size-9 items-center justify-center rounded-md text-xl transition-colors hover:bg-neutral-100"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
