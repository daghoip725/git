import Link from 'next/link';

import { CategoryIcon } from '@/components/categories/CategoryIcon';
import type { CategoryWithCount } from '@/types';
import { formatCompactNumber } from '@/utils/format';

export interface CategoryGridProps {
  categories: CategoryWithCount[];
}

/** Grille des catégories : 2 colonnes sur mobile, jusqu'à 5 sur desktop. */
export function CategoryGrid({ categories }: CategoryGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`/annonces?categorie=${category.slug}`}
            className="group flex h-full flex-col items-center gap-2.5 rounded-xl border border-neutral-200 bg-white p-4 text-center transition-all hover:border-brand-300 hover:shadow-[var(--shadow-card-hover)]"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white">
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
