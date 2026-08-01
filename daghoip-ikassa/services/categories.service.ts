import 'server-only';

/**
 * Lecture des catégories. Les catégories changent rarement : les requêtes sont
 * mémoïsées par requête HTTP via `cache()` de React.
 */
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Category, CategoryWithCount } from '@/types';

/** Toutes les catégories actives, triées par position puis par nom. */
export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    logger.error('Chargement des catégories impossible', error);
    return [];
  }
  return data ?? [];
});

/** Catégories racines (sans parent). */
export const getRootCategories = cache(async (): Promise<Category[]> => {
  const categories = await getCategories();
  return categories.filter((category) => category.parent_id === null);
});

/** Sous-catégories d'une catégorie donnée. */
export const getChildCategories = cache(async (parentId: string): Promise<Category[]> => {
  const categories = await getCategories();
  return categories.filter((category) => category.parent_id === parentId);
});

/** Une catégorie par son slug, ou `null` si elle n'existe pas / est inactive. */
export const getCategoryBySlug = cache(async (slug: string): Promise<Category | null> => {
  const categories = await getCategories();
  return categories.find((category) => category.slug === slug) ?? null;
});

/**
 * Catégories racines enrichies du nombre d'annonces publiées.
 * Le comptage est fait en une requête agrégée par catégorie (`head: true`).
 */
export const getRootCategoriesWithCounts = cache(async (): Promise<CategoryWithCount[]> => {
  const supabase = await createClient();
  const categories = await getCategories();
  const roots = categories.filter((category) => category.parent_id === null);

  const counts = await Promise.all(
    roots.map(async (root) => {
      const descendantIds = [
        root.id,
        ...categories.filter((child) => child.parent_id === root.id).map((child) => child.id),
      ];

      const { count, error } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .in('category_id', descendantIds);

      if (error) {
        logger.error('Comptage des annonces par catégorie impossible', error, {
          categorySlug: root.slug,
        });
      }

      return { ...root, listingsCount: count ?? 0 } satisfies CategoryWithCount;
    }),
  );

  return counts;
});

/**
 * Identifiants d'une catégorie et de ses enfants directs.
 * Utilisé pour filtrer une recherche sur une catégorie racine.
 */
export async function getCategoryIdsForSlug(slug: string): Promise<string[]> {
  const categories = await getCategories();
  const target = categories.find((category) => category.slug === slug);
  if (!target) return [];
  return [
    target.id,
    ...categories.filter((child) => child.parent_id === target.id).map((child) => child.id),
  ];
}
