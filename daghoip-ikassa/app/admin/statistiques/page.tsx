import { Banknote, FileText, Flag, MessageSquare, TrendingUp, Users } from 'lucide-react';

import { BarList } from '@/components/charts/BarList';
import { StatTile } from '@/components/charts/StatTile';
import { TrendChart } from '@/components/charts/TrendChart';
import { Alert } from '@/components/ui/Alert';
import { requireRole } from '@/lib/auth/roles';
import { getAdDistribution, getAdminKpis, getDailyStats } from '@/services/admin.service';
import type { AdStatus } from '@/types';
import { AD_STATUS_LABELS } from '@/utils/constants';
import { formatPrice } from '@/utils/format';

/** Le nombre de jours est fixé côté page ; la base le borne à 7–180. */
const WINDOW_DAYS = 30;

export default async function AdminStatsPage() {
  await requireRole('moderator');

  const [kpis, daily, byCategory, byCity, byStatus] = await Promise.all([
    getAdminKpis(),
    getDailyStats(WINDOW_DAYS),
    getAdDistribution('category', 8),
    getAdDistribution('city', 8),
    getAdDistribution('status', 8),
  ]);

  if (!kpis) {
    return (
      <Alert tone="error" title="Statistiques indisponibles">
        Les indicateurs n’ont pas pu être chargés. Réessayez dans un instant.
      </Alert>
    );
  }

  const money = (value: number) => formatPrice(value) ?? '0 FCFA';

  return (
    <div className="space-y-8">
      {/* --------------------------- Indicateurs --------------------------- */}
      <section aria-labelledby="kpi-title">
        <h2 id="kpi-title" className="mb-3 text-lg font-bold text-brand-900">
          Vue d’ensemble
        </h2>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Comptes"
            value={kpis.total_users}
            icon={Users}
            hint={`${kpis.new_users_30d.toLocaleString('fr-GA')} depuis 30 jours`}
            href="/admin/utilisateurs"
          />
          <StatTile
            label="Annonces publiées"
            value={kpis.published_ads}
            icon={FileText}
            hint={`${kpis.total_ads.toLocaleString('fr-GA')} au total`}
            href="/admin/annonces?statut=published"
          />
          <StatTile
            label="Messages (30 j)"
            value={kpis.messages_30d}
            icon={MessageSquare}
            hint="Volume, jamais le contenu"
          />
          <StatTile
            label="Recettes (30 j)"
            value={money(kpis.revenue_30d)}
            icon={Banknote}
            hint={`${money(kpis.revenue_total)} depuis l’ouverture`}
            href="/admin/paiements"
          />
          <StatTile
            label="En attente de revue"
            value={kpis.pending_review_ads}
            icon={FileText}
            tone={kpis.pending_review_ads > 0 ? 'alert' : 'default'}
            href="/admin/annonces?statut=pending_review"
          />
          <StatTile
            label="Signalements ouverts"
            value={kpis.open_reports}
            icon={Flag}
            tone={kpis.open_reports > 0 ? 'alert' : 'default'}
            href="/admin/signalements"
          />
          <StatTile
            label="Abonnements actifs"
            value={kpis.active_subscriptions}
            icon={TrendingUp}
            href="/admin/abonnements"
          />
          <StatTile
            label="Comptes restreints"
            value={kpis.suspended_users}
            icon={Users}
            tone={kpis.suspended_users > 0 ? 'alert' : 'default'}
            href="/admin/utilisateurs?statut=suspended"
          />
        </div>
      </section>

      {/* ---------------------------- Évolution ---------------------------- */}
      <section aria-labelledby="trend-title">
        <h2 id="trend-title" className="mb-1 text-lg font-bold text-brand-900">
          Évolution sur {WINDOW_DAYS} jours
        </h2>
        <p className="mb-3 text-sm text-neutral-600">
          Quatre séries, quatre graphiques : leurs ordres de grandeur n’ont rien à voir, les
          superposer imposerait deux axes verticaux et fausserait la lecture.
        </p>

        <div className="grid gap-4 xl:grid-cols-2">
          <TrendChart
            title="Nouveaux comptes"
            points={daily.map((row) => ({ day: row.day, value: row.new_users }))}
          />
          <TrendChart
            title="Annonces déposées"
            points={daily.map((row) => ({ day: row.day, value: row.new_ads }))}
          />
          <TrendChart
            title="Messages échangés"
            points={daily.map((row) => ({ day: row.day, value: row.new_messages }))}
          />
          <TrendChart
            title="Recettes encaissées"
            points={daily.map((row) => ({ day: row.day, value: row.revenue }))}
            color="var(--color-gold-600)"
            format="currency"
          />
        </div>
      </section>

      {/* --------------------------- Répartitions --------------------------- */}
      <section aria-labelledby="split-title">
        <h2 id="split-title" className="mb-3 text-lg font-bold text-brand-900">
          Répartitions
        </h2>

        <div className="grid gap-4 lg:grid-cols-3">
          <BarList
            title="Annonces par catégorie"
            items={byCategory.map((row) => ({ label: row.label, value: row.total }))}
          />
          <BarList
            title="Annonces par ville"
            items={byCity.map((row) => ({ label: row.label, value: row.total }))}
          />
          <BarList
            title="Annonces par statut"
            items={byStatus.map((row) => ({
              label: AD_STATUS_LABELS[row.label as AdStatus] ?? row.label,
              value: row.total,
            }))}
          />
        </div>
      </section>

      <Alert tone="info" title="Ce que ces chiffres ne contiennent pas">
        Les statistiques sont des agrégats : nombre de messages, jamais leur contenu ; montants
        encaissés, jamais les coordonnées de paiement. Elles sont calculées par des fonctions
        réservées à l’équipe et refusées à tout autre appelant.
      </Alert>
    </div>
  );
}
