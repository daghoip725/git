import 'server-only';

/**
 * Lectures de l'espace d'administration.
 *
 * Ces requêtes n'ont rien de privilégié en elles-mêmes : elles passent par le
 * client anonyme et c'est la RLS qui décide. Un utilisateur ordinaire qui les
 * appellerait obtiendrait simplement des listes vides — la garde de rôle côté
 * Next.js n'est là que pour éviter d'afficher une page inutile.
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getAvatarUrl } from '@/services/storage.service';
import type {
  AccountStatus,
  AdStatus,
  Database,
  PaymentStatus,
  SubscriptionStatus,
  Tables,
  UserRole,
} from '@/types/database';
import type { AdFeaturePlan, Payment, Subscription, SubscriptionPlan } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Utilisateurs                                                              */
/* -------------------------------------------------------------------------- */

export interface AdminUserRow {
  id: string;
  full_name: string;
  city: string | null;
  role: UserRole;
  status: AccountStatus;
  is_verified: boolean;
  is_professional: boolean;
  business_name: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  auth_provider: string | null;
  ads_count: number;
  rating_average: number;
  rating_count: number;
  created_at: string;
  avatarUrl: string | null;
}

const ADMIN_USER_COLUMNS =
  'id, full_name, avatar_path, city, role, status, is_verified, is_professional, ' +
  'business_name, email_verified, phone_verified, auth_provider, ads_count, ' +
  'rating_average, rating_count, created_at';

export interface AdminUserFilters {
  query?: string;
  role?: UserRole;
  status?: AccountStatus;
  limit?: number;
}

/** Liste des comptes, filtrable par nom, rôle et statut. */
export async function getAdminUsers(filters: AdminUserFilters = {}): Promise<AdminUserRow[]> {
  const supabase = await createClient();

  let query = supabase.from('users').select(ADMIN_USER_COLUMNS);

  if (filters.query) {
    // `ilike` échappe les caractères spéciaux côté PostgREST ; on retire tout
    // de même les jokers pour éviter une recherche `%%` involontaire.
    const term = filters.query.replace(/[%_]/g, '').trim();
    if (term) query = query.ilike('full_name', `%${term}%`);
  }
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)
    .returns<(Omit<AdminUserRow, 'avatarUrl'> & { avatar_path: string | null })[]>();

  if (error) {
    logger.error('Chargement des utilisateurs impossible', error);
    return [];
  }

  return (data ?? []).map(({ avatar_path, ...row }) => ({
    ...row,
    avatarUrl: getAvatarUrl(avatar_path),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Signalements                                                              */
/* -------------------------------------------------------------------------- */

export type Report = Tables<'reports'>;

export interface ReportWithContext extends Report {
  reporter: { id: string; full_name: string } | null;
  ad: { id: string; title: string; slug: string; reference: string; status: string } | null;
  target_user: { id: string; full_name: string; status: AccountStatus } | null;
}

const REPORT_COLUMNS = `
  id, reporter_id, target_type, ad_id, target_user_id, message_id, review_id,
  reason, details, status, resolved_by, resolved_at, resolution_note, created_at,
  reporter:users!reports_reporter_id_fkey(id, full_name),
  ad:ads!reports_ad_id_fkey(id, title, slug, reference, status),
  target_user:users!reports_target_user_id_fkey(id, full_name, status)
`;

/** File de modération : signalements ouverts d'abord. */
export async function getReports(
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed' = 'open',
  limit = 50,
): Promise<ReportWithContext[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reports')
    .select(REPORT_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: status === 'open' })
    .limit(limit)
    .returns<ReportWithContext[]>();

  if (error) {
    logger.error('Chargement des signalements impossible', error);
    return [];
  }
  return data ?? [];
}

export async function countOpenReports(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'reviewing']);

  return count ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Journal d'audit                                                           */
/* -------------------------------------------------------------------------- */

export type AuditEntry = Tables<'auth_audit_log'>;

export interface AuditEntryWithNames extends AuditEntry {
  actor: { id: string; full_name: string } | null;
  target: { id: string; full_name: string } | null;
}

/** Dernières actions sensibles. Lisible par le staff uniquement (RLS). */
export async function getAuditLog(limit = 50): Promise<AuditEntryWithNames[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('auth_audit_log')
    .select(
      `id, actor_id, action, target_user_id, details, created_at,
       actor:users!auth_audit_log_actor_id_fkey(id, full_name),
       target:users!auth_audit_log_target_user_id_fkey(id, full_name)`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<AuditEntryWithNames[]>();

  if (error) {
    logger.error('Chargement du journal d’audit impossible', error);
    return [];
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Tableau de bord                                                           */
/* -------------------------------------------------------------------------- */

export interface AdminOverview {
  totalUsers: number;
  staffCount: number;
  suspendedCount: number;
  verifiedCount: number;
  pendingVerifications: number;
  openReports: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const [users, staff, suspended, verified, pending, reports] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).neq('role', 'user'),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('status', ['suspended', 'banned']),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_verified', true),
    supabase
      .from('verification_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'reviewing']),
  ]);

  return {
    totalUsers: users.count ?? 0,
    staffCount: staff.count ?? 0,
    suspendedCount: suspended.count ?? 0,
    verifiedCount: verified.count ?? 0,
    pendingVerifications: pending.count ?? 0,
    openReports: reports.count ?? 0,
  };
}

/** Annonces en attente de revue — badge de navigation. */
export async function countAdsPendingReview(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('ads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review');

  if (error) {
    logger.error('Comptage des annonces en attente impossible', error);
    return 0;
  }
  return count ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Statistiques                                                              */
/* -------------------------------------------------------------------------- */

export type AdminKpis = Database['public']['Functions']['admin_kpis']['Returns'][number];
export type DailyStat = Database['public']['Functions']['admin_daily_stats']['Returns'][number];
export type Distribution =
  Database['public']['Functions']['admin_ad_distribution']['Returns'][number];

/** Indicateurs instantanés. `null` si l'appelant n'est pas habilité. */
export async function getAdminKpis(): Promise<AdminKpis | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_kpis');

  if (error) {
    logger.error('Chargement des indicateurs impossible', error);
    return null;
  }
  return data?.[0] ?? null;
}

/** Série quotidienne, jours creux compris. */
export async function getDailyStats(days = 30): Promise<DailyStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_daily_stats', { p_days: days });

  if (error) {
    logger.error('Chargement de la série quotidienne impossible', error, { days });
    return [];
  }
  return data ?? [];
}

/** Répartition des annonces selon une dimension fermée. */
export async function getAdDistribution(
  dimension: 'category' | 'city' | 'status',
  limit = 8,
): Promise<Distribution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_ad_distribution', {
    p_dimension: dimension,
    p_limit: limit,
  });

  if (error) {
    logger.error('Chargement de la répartition impossible', error, { dimension });
    return [];
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Annonces                                                                  */
/* -------------------------------------------------------------------------- */

export interface AdminAdRow {
  id: string;
  reference: string;
  title: string;
  slug: string;
  status: AdStatus;
  price: number | null;
  city: string;
  views_count: number;
  created_at: string;
  rejection_reason: string | null;
  seller: { id: string; full_name: string } | null;
  category: { name: string } | null;
}

export interface AdminAdFilters {
  status?: AdStatus;
  query?: string;
  limit?: number;
}

/**
 * Annonces, tous statuts confondus.
 * La politique `ads_select_public` ouvre déjà l'intégralité de la table au
 * staff : aucune RPC dédiée n'est nécessaire ici.
 */
export async function getAdminAds(filters: AdminAdFilters = {}): Promise<AdminAdRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('ads')
    .select(
      'id, reference, title, slug, status, price, city, views_count, created_at, ' +
        'rejection_reason, seller:users!ads_seller_id_fkey(id, full_name), ' +
        'category:categories!ads_category_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.query) {
    const term = filters.query.trim();
    // `reference` est en majuscules ; `ilike` couvre les deux colonnes sans
    // imposer à l'administrateur de connaître la casse exacte.
    query = query.or(`title.ilike.%${term}%,reference.ilike.%${term}%`);
  }

  const { data, error } = await query.returns<AdminAdRow[]>();

  if (error) {
    logger.error('Chargement des annonces (admin) impossible', error, { filters });
    return [];
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Paiements et abonnements                                                  */
/* -------------------------------------------------------------------------- */

export interface AdminPaymentRow extends Payment {
  user: { id: string; full_name: string } | null;
}

/** Paiements, du plus récent au plus ancien. RLS : `user_id = auth.uid() or is_staff()`. */
export async function getAdminPayments(
  filters: { status?: PaymentStatus; limit?: number } = {},
): Promise<AdminPaymentRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('payments')
    .select('*, user:users!payments_user_id_fkey(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query.returns<AdminPaymentRow[]>();

  if (error) {
    logger.error('Chargement des paiements impossible', error, { filters });
    return [];
  }
  return data ?? [];
}

export interface AdminSubscriptionRow extends Subscription {
  user: { id: string; full_name: string } | null;
  plan: { code: string; name: string; price: number } | null;
}

export async function getAdminSubscriptions(
  filters: { status?: SubscriptionStatus; limit?: number } = {},
): Promise<AdminSubscriptionRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('subscriptions')
    .select(
      '*, user:users!subscriptions_user_id_fkey(id, full_name), ' +
        'plan:subscription_plans!subscriptions_plan_id_fkey(code, name, price)',
    )
    .order('current_period_end', { ascending: false })
    .limit(Math.min(filters.limit ?? 50, 200));

  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query.returns<AdminSubscriptionRow[]>();

  if (error) {
    logger.error('Chargement des abonnements impossible', error, { filters });
    return [];
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Offres (paramètres)                                                       */
/* -------------------------------------------------------------------------- */

/** Toutes les offres d'abonnement, actives ou non — vue d'administration. */
export async function getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('position', { ascending: true });

  if (error) {
    logger.error('Chargement des offres d’abonnement impossible', error);
    return [];
  }
  return data ?? [];
}

/** Toutes les offres de mise en avant, actives ou non. */
export async function getAllFeaturePlans(): Promise<AdFeaturePlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ad_feature_plans')
    .select('*')
    .order('position', { ascending: true });

  if (error) {
    logger.error('Chargement des offres de mise en avant impossible', error);
    return [];
  }
  return data ?? [];
}
