'use client';

/**
 * Classement horizontal : une barre par élément, du plus fourni au moins fourni.
 *
 * Barres **horizontales** parce que les libellés sont longs et en français —
 * « Immobilier », « Port-Gentil », « Véhicules d'occasion » : à la verticale il
 * faudrait les incliner, ce qui les rend pénibles à lire.
 *
 * Une seule teinte : la couleur code la magnitude, pas l'identité. L'identité
 * est portée par le libellé, écrit en toutes lettres à gauche de sa barre — pas
 * de légende à décoder, pas de correspondance de couleurs à faire de tête.
 */
import { useId } from 'react';

import { formatValue, type ValueFormat } from '@/components/charts/format';
import { cn } from '@/utils/cn';

export interface BarListItem {
  label: string;
  value: number;
}

export interface BarListProps {
  title: string;
  items: BarListItem[];
  /** Descripteur de mise en forme — jamais une fonction : ce composant est
   *  rendu depuis un Server Component, qui ne peut pas en sérialiser. */
  format?: ValueFormat;
  /** Texte affiché quand la liste est vide. */
  emptyLabel?: string;
  color?: string;
  className?: string;
}

export function BarList({
  title,
  items,
  format = 'number',
  emptyLabel = 'Aucune donnée pour l’instant.',
  color = 'var(--color-brand-700)',
  className,
}: BarListProps) {
  const titleId = useId();
  const show = (value: number) => formatValue(value, format);
  const max = Math.max(...items.map((item) => item.value), 1);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <figure
      className={cn('rounded-xl border border-neutral-200 bg-white p-4', className)}
      aria-labelledby={titleId}
    >
      <figcaption className="mb-3">
        <h3 id={titleId} className="text-sm font-semibold text-neutral-800">
          {title}
        </h3>
        {/* « Total affiché » et non « total » : la liste est tronquée aux
            premiers éléments, additionner ce qu'on voit ne donne pas le total
            de la plateforme. */}
        <p className="text-xs text-neutral-500">Total affiché : {show(total)}</p>
      </figcaption>

      {items.length > 0 ? (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const ratio = item.value / max;
            return (
              <li key={item.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-700" title={item.label}>
                    {item.label}
                  </span>
                  {/* Valeur en toutes lettres à droite : c'est le libellé
                      direct, qui dispense de faire lire une longueur à l'œil. */}
                  <span className="shrink-0 font-semibold text-neutral-900 tabular-nums">
                    {show(item.value)}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100"
                  role="img"
                  aria-label={`${item.label} : ${show(item.value)}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(ratio * 100, 2)}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-neutral-500">{emptyLabel}</p>
      )}
    </figure>
  );
}
