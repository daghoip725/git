import Link from 'next/link';

import { CategoryIcon } from '@/components/categories/CategoryIcon';
import type { CategoryWithCount } from '@/types';
import { cn } from '@/utils/cn';
import { formatCompactNumber } from '@/utils/format';

export interface CategoryGridProps {
  categories: CategoryWithCount[];
  /**
   * Bandeau défilable sur mobile plutôt que grille : évite qu'une quinzaine de
   * catégories n'occupe deux écrans avant les premières annonces.
   */
  scrollOnMobile?: boolean;
  className?: string;
}

/** Grille des catégories : 2 colonnes sur mobile, jusqu'à 5 sur desktop. */
export function CategoryGrid({ categories, scrollOnMobile = false, className }: CategoryGridProps) {
  return (
    <ul
      className={cn(
        scrollOnMobile
          ? 'scroll-row lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0'
          : 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
        className,
      )}
    >
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`/annonces?categorie=${category.slug}`}
            className={cn(
              'surface-card group flex h-full flex-col items-center gap-2.5 p-4 text-center',
              'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300',
              'hover:shadow-[var(--shadow-card-hover)]',
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-800 transition-colors group-hover:bg-brand-700 group-hover:text-white">
              <CategoryIcon name={category.icon} className="size-6" />
            </span>

            <span className="text-sm leading-tight font-semibold text-brand-900">
              {category.name}
            </span>

            <span className="text-xs text-neutral-500">
              {formatCompactNumber(category.listingsCount)} annonce
              {category.listingsCount > 1 ? 's' : ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
