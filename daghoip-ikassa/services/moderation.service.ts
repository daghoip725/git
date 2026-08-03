import 'server-only';

/**
 * File de travail anti-fraude — côté lecture.
 *
 * Les deux fonctions SQL appelées ici vérifient `is_staff()` **en première
 * ligne** : un compte ordinaire qui atteindrait ce service par un autre chemin
 * n'obtiendrait rien. La garde de rôle côté page ne sert qu'à ne pas afficher
 * un écran vide.
 */
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

export interface FraudSignal {
  signal: string;
  weight: number;
  detail: string;
}

export interface FlaggedAd {
  id: string;
  reference: string;
  title: string;
  slug: string;
  price: number | null;
  city: string;
  sellerId: string;
  sellerName: string;
  score: number;
  createdAt: string;
  signals: FraudSignal[];
}

/** Détail des signaux d'une annonce. */
export async function getFraudSignals(adId: string): Promise<FraudSignal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ad_fraud_signals', { p_ad_id: adId });

  if (error) {
    logger.warn('Signaux de fraude indisponibles', { adId, code: error.code });
    return [];
  }
  return data ?? [];
}

/**
 * Annonces au-dessus du seuil, avec le détail de leurs signaux.
 *
 * Les signaux sont chargés en parallèle après le classement : `flagged_ads()`
 * renvoie déjà le score, mais afficher un nombre sans sa justification
 * empêcherait le modérateur de motiver sa décision — et de la contester.
 */
export async function getFlaggedAds(minScore = 40, limit = 30): Promise<FlaggedAd[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('flagged_ads', {
    p_min_score: minScore,
    p_limit: limit,
  });

  if (error) {
    logger.error('Chargement de la file anti-fraude impossible', error);
    return [];
  }

  const rows = data ?? [];
  const signals = await Promise.all(rows.map((row) => getFraudSignals(row.id)));

  return rows.map((row, index) => ({
    id: row.id,
    reference: row.reference,
    title: row.title,
    slug: row.slug,
    price: row.price,
    city: row.city,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    score: row.score,
    createdAt: row.created_at,
    signals: signals[index] ?? [],
  }));
}
