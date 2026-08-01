import 'server-only';

/**
 * Lecture des catégories.
 *
 * Le nombre d'annonces par catégorie est un compteur dénormalisé
 * (`categories.ads_count`), maintenu par trigger à chaque changement de statut
 * ou de catégorie d'une annonce : la page d'accueil n'exécute donc plus un
 * COUNT(*) par catégorie.
 *
 * Les catégories changent rarement : les requêtes sont mémoïsées par requête
 * HTTP via `cache()` de React.
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
 * Catégories racines avec le total d'annonces de la racine et de ses enfants.
 * Aucune requête supplémentaire : tout vient du compteur dénormalisé.
 */
export const getRootCategoriesWithCounts = cache(async (): Promise<CategoryWithCount[]> => {
  const categories = await getCategories();

  return categories
    .filter((category) => category.parent_id === null)
    .map((root) => {
      const childrenTotal = categories
        .filter((child) => child.parent_id === root.id)
        .reduce((total, child) => total + child.ads_count, 0);

      return { ...root, listingsCount: root.ads_count + childrenTotal };
    });
});
