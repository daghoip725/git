import { BadgeCheck } from 'lucide-react';

import { cn } from '@/utils/cn';

export interface VerifiedBadgeProps {
  /** `icon` : pastille seule. `full` : pastille + libellé. */
  variant?: 'icon' | 'full';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Badge « vendeur vérifié ».
 *
 * Il n'est affiché que si `users.is_verified` vaut `true` — colonne exclue du
 * `GRANT UPDATE` accordé aux utilisateurs et positionnée uniquement par
 * `review_verification()` après contrôle des pièces par un modérateur.
 * Autrement dit, ce badge ne peut pas être auto-attribué.
 */
export function VerifiedBadge({ variant = 'icon', size = 'md', className }: VerifiedBadgeProps) {
  const iconSize = size === 'sm' ? 'size-4' : 'size-4.5';
  const label = 'Identité vérifiée par Daghoip Ikassa';

  if (variant === 'icon') {
    return (
      <span title={label} className={cn('inline-flex shrink-0', className)}>
        <BadgeCheck className={cn(iconSize, 'text-brand-600')} aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      title={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-200 ring-inset',
        className,
      )}
    >
      <BadgeCheck className={cn(iconSize, 'text-brand-600')} aria-hidden="true" />
      Vendeur vérifié
    </span>
  );
}
