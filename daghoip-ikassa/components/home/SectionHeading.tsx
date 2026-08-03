import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface SectionHeadingProps {
  id: string;
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Accent doré pour les blocs sponsorisés. */
  tone?: 'brand' | 'gold';
  link?: { href: string; label: string };
  children?: ReactNode;
}

/**
 * En-tête de section commun à toute la page d'accueil.
 *
 * Uniformiser ce bloc est ce qui donne son rythme à la page : même échelle
 * typographique, même position du lien « voir tout », même alignement — c'est
 * moins visible qu'un effet graphique, mais c'est ce qui fait « soigné ».
 */
export function SectionHeading({
  id,
  title,
  description,
  icon: Icon,
  tone = 'brand',
  link,
  children,
}: SectionHeadingProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                tone === 'gold' ? 'bg-gold-100 text-gold-700' : 'bg-brand-50 text-brand-800',
              )}
            >
              <Icon className="size-5" />
            </span>
          ) : null}

          <h2 id={id} className="text-xl font-extrabold text-brand-900 sm:text-2xl lg:text-3xl">
            {title}
          </h2>
        </div>

        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-neutral-600 sm:text-base">{description}</p>
        ) : null}

        {children}
      </div>

      {link ? (
        <Link
          href={link.href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-800 transition-colors hover:text-brand-800"
        >
          {link.label}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
