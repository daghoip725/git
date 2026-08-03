import 'server-only';

/**
 * Performances des annonces, côté vendeur (Server Components uniquement).
 *
 * Tout passe par des fonctions SQL qui filtrent elles-mêmes sur `auth.uid()` :
 * `ad_performance`, `ad_daily_series` et `seller_performance` refusent ou
 * ignorent ce qui n'appartient pas à l'appelant. Aucun filtre de propriété
 * n'est donc réécrit ici — le faire donnerait l'illusion que le cloisonnement
 * dépend de ce fichier, alors qu'il tient à la base et y est testé.
 *
 * Les tables brutes (`ad_daily_stats`, `ad_contacts`) ne sont jamais lues
 * directement : elles sont fermées aux clients, y compris au vendeur concerné.
 */
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

/** Indicateurs d'une annonce, à un instant donné. */
export interface AdPerformance {
  views: number;
  contacts: number;
  favorites: number;
  messages: number;
  /** Part des visiteurs ayant pris contact, en pourcentage. */
  contactRate: number;
  /** Médiane des vues des annonces publiées de la même catégorie. */
  categoryMedianViews: number;
  daysOnline: number;
  publishedAt: string | null;
}

/** Un jour de la série : jamais de trou, un jour creux vaut zéro. */
export interface DailyStat {
  day: string;
  views: number;
  contacts: number;
  favorites: number;
}

/** Synthèse d'un compte vendeur, toutes annonces confondues. */
export interface SellerPerformance {
  adsPublished: number;
  totalViews: number;
  totalContacts: number;
  totalFavorites: number;
  totalMessages: number;
  periodViews: number;
  periodContacts: number;
}

/** Une ligne du classement des annonces du vendeur. */
export interface RankedAd {
  id: string;
  title: string;
  slug: string;
  reference: string;
  views: number;
  contacts: number;
  favorites: number;
  contactRate: number;
}

/**
 * Performances d'une annonce.
 *
 * Renvoie `null` quand l'annonce n'existe pas ou n'appartient pas à
 * l'appelant : la fonction SQL lève dans les deux cas, sans distinguer l'un de
 * l'autre — répondre « elle existe, mais elle n'est pas à vous » apprendrait
 * déjà quelque chose à un curieux.
 */
export async function getAdPerformance(adId: string): Promise<AdPerformance | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ad_performance', { p_ad_id: adId });

  if (error) {
    logger.warn('Performances indisponibles', { adId, error: error.message });
    return null;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    views: row.views,
    contacts: row.contacts,
    favorites: row.favorites,
    messages: row.messages,
    contactRate: Number(row.contact_rate),
    categoryMedianViews: row.category_median_views,
    daysOnline: row.days_online,
    publishedAt: row.published_at,
  };
}

/**
 * Série quotidienne d'une annonce.
 *
 * La fenêtre est bornée côté base (7 à 180 jours) ; inutile de la revalider
 * ici. Une liste vide signale un refus, pas une annonce sans activité — celle-ci
 * renvoie des zéros, jamais rien.
 */
export async function getAdDailySeries(adId: string, days = 30): Promise<DailyStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ad_daily_series', { p_ad_id: adId, p_days: days });

  if (error) {
    logger.warn('Série quotidienne indisponible', { adId, error: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    day: row.day,
    views: row.views,
    contacts: row.contacts,
    favorites: row.favorites,
  }));
}

/** Synthèse du compte courant. `null` si aucune session. */
export async function getSellerPerformance(days = 30): Promise<SellerPerformance | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('seller_performance', { p_days: days });

  if (error) {
    logger.warn('Synthèse vendeur indisponible', { error: error.message });
    return null;
  }

  // Aucune ligne : visiteur sans session. La fonction SQL sort alors sans rien
  // renvoyer, et ce n'est pas une erreur.
  const row = data?.[0];
  if (!row) return null;

  return {
    adsPublished: row.ads_published,
    totalViews: row.total_views,
    totalContacts: row.total_contacts,
    totalFavorites: row.total_favorites,
    totalMessages: row.total_messages,
    periodViews: row.period_views,
    periodContacts: row.period_contacts,
  };
}

/**
 * Classement des annonces du vendeur.
 *
 * Trié par contacts côté base, et on ne retrie pas ici : une annonce très vue
 * et jamais contactée doit rester en bas, c'est l'information utile.
 */
export async function getSellerAdRanking(limit = 10): Promise<RankedAd[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('seller_ad_ranking', { p_limit: limit });

  if (error) {
    logger.warn('Classement des annonces indisponible', { error: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    reference: row.reference,
    views: row.views,
    contacts: row.contacts,
    favorites: row.favorites,
    contactRate: Number(row.contact_rate),
  }));
}
