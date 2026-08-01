import type { Metadata } from 'next';
import Link from 'next/link';

import { CategoryIcon } from '@/components/categories/CategoryIcon';
import { getCategories, getRootCategoriesWithCounts } from '@/services/categories.service';
import { formatCompactNumber } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Toutes les catégories',
  description:
    'Parcourez toutes les catégories d’annonces de Daghoip Ikassa : véhicules, immobilier, téléphones, emploi, services et bien plus au Gabon.',
};

export default async function CategoriesPage() {
  const [roots, all] = await Promise.all([getRootCategoriesWithCounts(), getCategories()]);

  return (
    <div className="container-app py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">
          Toutes les catégories
        </h1>
        <p className="mt-1 text-neutral-600">
          Trouvez ce que vous cherchez parmi nos {roots.length} univers.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roots.map((category) => {
          const children = all.filter((child) => child.parent_id === category.id);

          return (
            <section
              key={category.id}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <Link
                href={`/annonces?categorie=${category.slug}`}
                className="flex items-center gap-3"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <CategoryIcon name={category.icon} className="size-5.5" />
                </span>
                <span className="min-w-0">
                  <h2 className="font-bold text-brand-900 hover:text-brand-700">{category.name}</h2>
                  <span className="text-xs text-neutral-500">
                    {formatCompactNumber(category.listingsCount)} annonce
                    {category.listingsCount > 1 ? 's' : ''}
                  </span>
                </span>
              </Link>

              {category.description ? (
                <p className="mt-3 text-sm text-neutral-600">{category.description}</p>
              ) : null}

              {children.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/annonces?categorie=${child.slug}`}
                        className="inline-block rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
