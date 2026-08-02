import type { Metadata } from 'next';

import { SearchExperience } from '@/components/listings/SearchExperience';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCategories, getCategoryBySlug } from '@/services/categories.service';
import { getFavoriteAdIds, searchAds } from '@/services/ads.service';
import type { AdFilters as Filters } from '@/types';
import { listingFiltersSchema } from '@/utils/validation';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Lit un paramètre d'URL en ignorant les valeurs répétées. */
function single(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result && result.trim() !== '' ? result : undefined;
}

/**
 * Convertit les paramètres d'URL (en français) en filtres validés.
 * Toute valeur non conforme est écartée par Zod plutôt que transmise à la base.
 *
 * Le filtre « autour de moi » n'apparaît pas ici : il vit uniquement côté
 * navigateur, la position d'un visiteur n'ayant rien à faire dans un lien
 * partagé.
 */
function parseFilters(searchParams: Record<string, string | string[] | undefined>): Filters {
  const parsed = listingFiltersSchema.safeParse({
    query: single(searchParams.q),
    categorySlug: single(searchParams.categorie),
    city: single(searchParams.ville),
    province: single(searchParams.province),
    district: single(searchParams.quartier),
    minPrice: single(searchParams.prix_min),
    maxPrice: single(searchParams.prix_max),
    condition: single(searchParams.etat),
    priceType: single(searchParams.type_prix),
    maxAgeDays: single(searchParams.depuis),
    sort: single(searchParams.tri),
    page: '1',
    perPage: undefined,
  });

  const base: Filters = parsed.success ? parsed.data : { page: 1 };

  // Filtre « annonces d'un vendeur » : accepté seulement si c'est un UUID.
  const sellerId = single(searchParams.vendeur);
  if (sellerId && /^[0-9a-f-]{36}$/i.test(sellerId)) base.sellerId = sellerId;

  return base;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = single(params.q);
  const categorySlug = single(params.categorie);
  const city = single(params.ville);

  const category = categorySlug ? await getCategoryBySlug(categorySlug) : null;

  const parts = [
    query ? `« ${query} »` : (category?.name ?? 'Petites annonces'),
    city ? `à ${city}` : 'au Gabon',
  ];

  return {
    title: parts.join(' '),
    description: `Découvrez ${parts.join(' ')} sur Daghoip Ikassa. Achetez et vendez en toute confiance au Gabon.`,
    // Les pages de recherche filtrées ne sont pas indexées (contenu dupliqué).
    robots: query || city ? { index: false, follow: true } : undefined,
  };
}

/**
 * Page de recherche.
 *
 * Le serveur ne rend que la **première page** de résultats : c'est ce que voit
 * un moteur d'indexation, et ce que voit un visiteur dont le JavaScript n'est
 * pas encore chargé. `SearchExperience` reprend ensuite la main pour les
 * recherches suivantes, sans repasser par ici.
 */
export default async function ListingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const user = await getCurrentUser();

  const [result, categories, favoriteIds] = await Promise.all([
    searchAds(filters),
    getCategories(),
    user ? getFavoriteAdIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  const category = filters.categorySlug ? await getCategoryBySlug(filters.categorySlug) : null;

  const heading =
    category?.name ??
    (filters.query ? `Résultats pour « ${filters.query} »` : 'Toutes les annonces');

  return (
    <div className="container-app py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">{heading}</h1>
      </header>

      <SearchExperience
        categories={categories}
        initialFilters={filters}
        initialResult={result}
        favoriteIds={[...favoriteIds]}
        isAuthenticated={Boolean(user)}
      />
    </div>
  );
}
