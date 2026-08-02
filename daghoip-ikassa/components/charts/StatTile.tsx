/**
 * Vignette d'indicateur : un libellé, une valeur, éventuellement une précision.
 *
 * Un nombre isolé n'est pas un graphique — le représenter par une barre unique
 * ou un camembert à deux parts n'ajoute rien et coûte de la place. La valeur est
 * donc écrite en grand, et la précision (« dont 3 en attente ») dit ce que le
 * nombre seul ne dit pas.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/utils/cn';

export interface StatTileProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  /** Précision affichée sous la valeur. */
  hint?: string;
  /** Rend la vignette cliquable. */
  href?: string;
  /** Signale une valeur qui appelle une action (signalements en attente…). */
  tone?: 'default' | 'alert';
  className?: string;
}

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = 'default',
  className,
}: StatTileProps) {
  const content = (
    <>
      {Icon ? (
        <Icon
          className={cn('size-5', tone === 'alert' ? 'text-red-600' : 'text-brand-600')}
          aria-hidden="true"
        />
      ) : null}
      <p className="mt-2 text-2xl font-extrabold text-brand-900 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('fr-GA') : value}
      </p>
      <p className="text-xs text-neutral-600">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p> : null}
    </>
  );

  const classes = cn(
    'rounded-xl border bg-white p-4',
    tone === 'alert' ? 'border-red-200' : 'border-neutral-200',
    href && 'transition-colors hover:border-brand-300',
    className,
  );

  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  );
}
