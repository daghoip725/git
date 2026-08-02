'use client';

/**
 * Courbe d'évolution sur une période, série unique.
 *
 * Dessinée en SVG, sans bibliothèque : un graphique de tendance se résume à
 * une mise à l'échelle et à un tracé, et embarquer Recharts ou Chart.js pour
 * cela pèserait plus que toutes les pages d'administration réunies.
 *
 * Choix de représentation, dans l'ordre où ils se posent :
 *
 *  1. **Une série par graphique.** Nouveaux comptes, annonces, messages et
 *     recettes n'ont pas les mêmes ordres de grandeur ; les superposer
 *     imposerait deux axes verticaux, la pire erreur possible en visualisation.
 *     On empile donc de petits graphiques indépendants — chacun avec sa propre
 *     échelle et son titre.
 *  2. **Une seule teinte**, celle de la marque : la couleur n'a pas de rôle
 *     d'identité ici, elle ne distingue rien. Pas de légende non plus — le
 *     titre dit ce qui est tracé.
 *  3. **Survol et tableau.** Le survol donne la valeur exacte d'un jour ; un
 *     tableau replié restitue la série entière, ce qui rend le graphique
 *     lisible au lecteur d'écran et exploitable au copier-coller.
 */
import { Table2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { formatAxisValue, formatValue, type ValueFormat } from '@/components/charts/format';
import { cn } from '@/utils/cn';

export interface TrendPoint {
  /** Date ISO (AAAA-MM-JJ). */
  day: string;
  value: number;
}

export interface TrendChartProps {
  title: string;
  points: TrendPoint[];
  /** Teinte de la série. Une seule par graphique. */
  color?: string;
  /**
   * Mise en forme des valeurs. Un **descripteur**, pas une fonction : ce
   * composant est rendu côté client depuis un Server Component, et React ne
   * sait pas sérialiser une fonction à travers cette frontière.
   */
  format?: ValueFormat;
  /** Sous-titre : total ou moyenne de la période. */
  summary?: string;
  className?: string;
}

const WIDTH = 640;
const HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 24, left: 46 };

/** Bornes « rondes » : 0 / 250 / 500 se lit mieux que 0 / 237 / 474. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  return date.toLocaleDateString('fr-GA', { day: 'numeric', month: 'short' });
}

export function TrendChart({
  title,
  points,
  color = 'var(--color-brand-700)',
  format = 'number',
  summary,
  className,
}: TrendChartProps) {
  const titleId = useId();
  const show = (value: number) => formatValue(value, format);
  // L'unité est portée par le sous-titre, pas répétée sur chaque graduation.
  const unitHint = format === 'currency' ? ' (FCFA)' : '';
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const geometry = useMemo(() => {
    const max = niceCeiling(Math.max(...points.map((point) => point.value), 0));
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const x = (index: number) =>
      PADDING.left +
      (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = (value: number) => PADDING.top + innerHeight - (value / max) * innerHeight;

    const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
    const area =
      points.length > 0
        ? `${PADDING.left},${PADDING.top + innerHeight} ${line} ${x(points.length - 1)},${PADDING.top + innerHeight}`
        : '';

    return { max, x, y, line, area, innerWidth, innerHeight };
  }, [points]);

  const total = points.reduce((sum, point) => sum + point.value, 0);
  const active = hovered === null ? null : points[hovered];

  return (
    <figure
      className={cn('rounded-xl border border-neutral-200 bg-white p-4', className)}
      aria-labelledby={titleId}
    >
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id={titleId} className="text-sm font-semibold text-neutral-800">
            {title}
            {unitHint}
          </h3>
          <p className="text-xs text-neutral-500">{summary ?? `${show(total)} sur la période`}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
        >
          <Table2 className="size-3.5" aria-hidden="true" />
          {showTable ? 'Masquer le tableau' : 'Voir le tableau'}
        </button>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-44 w-full"
          role="img"
          aria-label={`${title} : ${show(total)} au total sur ${points.length} jours.`}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Repères horizontaux : filets discrets, jamais pointillés. */}
          {[0, 0.5, 1].map((ratio) => {
            const value = geometry.max * ratio;
            const y = PADDING.top + geometry.innerHeight - ratio * geometry.innerHeight;
            return (
              <g key={ratio}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="var(--color-neutral-200)"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-neutral-400 text-[11px]"
                >
                  {formatAxisValue(Math.round(value), geometry.max)}
                </text>
              </g>
            );
          })}

          {points.length > 1 ? (
            <>
              <polygon points={geometry.area} fill={color} fillOpacity={0.1} />
              <polyline
                points={geometry.line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}

          {/* Extrémités de l'axe des dates : les libeller tous serait illisible. */}
          {points.length > 0 ? (
            <>
              <text
                x={PADDING.left}
                y={HEIGHT - 6}
                textAnchor="start"
                className="fill-neutral-400 text-[11px]"
              >
                {formatDay(points[0]!.day)}
              </text>
              <text
                x={WIDTH - PADDING.right}
                y={HEIGHT - 6}
                textAnchor="end"
                className="fill-neutral-400 text-[11px]"
              >
                {formatDay(points[points.length - 1]!.day)}
              </text>
            </>
          ) : null}

          {/* Repère de survol. */}
          {active ? (
            <>
              <line
                x1={geometry.x(hovered!)}
                x2={geometry.x(hovered!)}
                y1={PADDING.top}
                y2={PADDING.top + geometry.innerHeight}
                stroke={color}
                strokeWidth={1}
                strokeOpacity={0.4}
              />
              <circle
                cx={geometry.x(hovered!)}
                cy={geometry.y(active.value)}
                r={5}
                fill={color}
                stroke="white"
                strokeWidth={2}
              />
            </>
          ) : null}

          {/* Zones de survol : une bande par jour, plus large que la courbe
              elle-même pour rester atteignable au doigt comme à la souris. */}
          {points.map((point, index) => (
            <rect
              key={point.day}
              x={geometry.x(index) - geometry.innerWidth / (points.length * 2)}
              y={PADDING.top}
              width={geometry.innerWidth / points.length}
              height={geometry.innerHeight}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
            />
          ))}
        </svg>

        {active ? (
          <div
            role="status"
            className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-lg bg-neutral-900/90 px-2.5 py-1.5 text-xs font-medium text-white"
          >
            {formatDay(active.day)} · {show(active.value)}
          </div>
        ) : null}
      </div>

      {showTable ? (
        <div className="mt-3 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}, valeurs par jour</caption>
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th scope="col" className="py-1.5 font-medium">
                  Jour
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Valeur
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.day} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1.5 text-neutral-700">{formatDay(point.day)}</td>
                  <td className="py-1.5 text-right font-medium text-neutral-900">
                    {show(point.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
