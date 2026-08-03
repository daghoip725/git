import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/utils/cn';

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Construit l'URL d'une page donnée (conserve les filtres courants). */
  buildHref: (page: number) => string;
}

/** Fenêtre de pages autour de la page courante (max 5 numéros). */
function getPageWindow(page: number, totalPages: number): number[] {
  const size = Math.min(5, totalPages);
  let start = Math.max(1, page - 2);
  if (start + size - 1 > totalPages) start = Math.max(1, totalPages - size + 1);
  return Array.from({ length: size }, (_, index) => start + index);
}

export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageWindow(page, totalPages);
  const itemClass =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors';

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-label="Page précédente"
        aria-disabled={page === 1}
        className={cn(
          itemClass,
          'border-neutral-300 bg-card text-neutral-700 hover:bg-neutral-50',
          page === 1 && 'pointer-events-none opacity-40',
        )}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>

      {pages[0] !== 1 ? (
        <>
          <Link href={buildHref(1)} className={cn(itemClass, 'border-neutral-300 bg-card')}>
            1
          </Link>
          <span className="px-1 text-neutral-500" aria-hidden="true">
            …
          </span>
        </>
      ) : null}

      {pages.map((pageNumber) => (
        <Link
          key={pageNumber}
          href={buildHref(pageNumber)}
          aria-current={pageNumber === page ? 'page' : undefined}
          className={cn(
            itemClass,
            pageNumber === page
              ? 'border-brand-800 bg-brand-700 text-white'
              : 'border-neutral-300 bg-card text-neutral-700 hover:bg-neutral-50',
          )}
        >
          {pageNumber}
        </Link>
      ))}

      {pages[pages.length - 1] !== totalPages ? (
        <>
          <span className="px-1 text-neutral-500" aria-hidden="true">
            …
          </span>
          <Link
            href={buildHref(totalPages)}
            className={cn(itemClass, 'border-neutral-300 bg-card')}
          >
            {totalPages}
          </Link>
        </>
      ) : null}

      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-label="Page suivante"
        aria-disabled={page === totalPages}
        className={cn(
          itemClass,
          'border-neutral-300 bg-card text-neutral-700 hover:bg-neutral-50',
          page === totalPages && 'pointer-events-none opacity-40',
        )}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}
