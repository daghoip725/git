'use client';

/**
 * Sélecteur de thème : clair, sombre, système.
 *
 * Un groupe de trois boutons radio plutôt qu'un interrupteur à deux états :
 * l'interrupteur ne permet pas d'exprimer « suis mon téléphone », qui est
 * pourtant le réglage par défaut et souvent le bon.
 *
 * Rendu seulement après montage. Le serveur ne connaît pas le choix de
 * l'utilisateur — il est dans `localStorage` — et afficher un état arbitraire
 * puis le corriger provoquerait une erreur d'hydratation en plus d'un
 * clignotement.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { THEME_LABELS, applyTheme, readThemePreference, type ThemePreference } from '@/lib/theme';
import { cn } from '@/utils/cn';

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

export interface ThemeToggleProps {
  /** `inverted` pour un usage sur le vert de l'en-tête. */
  inverted?: boolean;
  className?: string;
}

export function ThemeToggle({ inverted = false, className }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setPreference(readThemePreference());
  }, []);

  // Suivre le réglage système tant que l'utilisateur n'a pas tranché : sans
  // cela, une bascule du téléphone à la tombée du jour laisserait l'onglet
  // ouvert dans l'ancien thème.
  useEffect(() => {
    if (preference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyTheme('system');
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [preference]);

  if (preference === null) {
    // Réserve la place exacte du groupe : sans elle, la barre d'en-tête
    // sursaute au montage.
    return <div className={cn('h-8 w-[6.5rem]', className)} aria-hidden="true" />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l’interface"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full p-0.5',
        inverted ? 'bg-white/10' : 'bg-neutral-100',
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Thème ${THEME_LABELS[value].toLowerCase()}`}
            title={THEME_LABELS[value]}
            onClick={() => {
              setPreference(value);
              applyTheme(value);
            }}
            className={cn(
              'flex size-7 items-center justify-center rounded-full transition-colors',
              active
                ? inverted
                  ? 'bg-white/90 text-brand-800'
                  : 'bg-card text-brand-800 shadow-sm'
                : inverted
                  ? 'text-white/70 hover:text-white'
                  : 'text-neutral-500 hover:text-neutral-800',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
