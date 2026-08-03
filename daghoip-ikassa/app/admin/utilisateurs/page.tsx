import { Users } from 'lucide-react';

import { UserRow } from '@/components/admin/UserRow';
import { EmptyState } from '@/components/common/EmptyState';
import { requireRole } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/supabase/server';
import { getAdminUsers } from '@/services/admin.service';
import type { AccountStatus, UserRole } from '@/types';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result && result.trim() !== '' ? result.trim() : undefined;
}

const ROLES: UserRole[] = ['user', 'moderator', 'admin'];
const STATUSES: AccountStatus[] = ['active', 'suspended', 'banned', 'deleted'];

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const viewerRole = await requireRole('moderator', '/admin/utilisateurs');
  const viewer = await getCurrentUser();

  const params = await searchParams;
  const query = single(params.q);
  const roleParam = single(params.role);
  const statusParam = single(params.statut);

  const users = await getAdminUsers({
    query,
    role: ROLES.includes(roleParam as UserRole) ? (roleParam as UserRole) : undefined,
    status: STATUSES.includes(statusParam as AccountStatus)
      ? (statusParam as AccountStatus)
      : undefined,
  });

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-brand-900">Utilisateurs</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {users.length} compte{users.length > 1 ? 's' : ''} affiché
          {users.length > 1 ? 's' : ''}.
        </p>
      </header>

      {/* Filtres : formulaire GET, l'état reste dans l'URL. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-card p-4"
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-800">Rechercher</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Nom du compte"
            className="h-10 rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-800">Rôle</span>
          <select
            name="role"
            defaultValue={roleParam ?? ''}
            className="h-10 rounded-lg border border-neutral-300 bg-card px-3 text-sm focus:outline-none"
          >
            <option value="">Tous</option>
            <option value="user">Utilisateur</option>
            <option value="moderator">Modérateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-800">Statut</span>
          <select
            name="statut"
            defaultValue={statusParam ?? ''}
            className="h-10 rounded-lg border border-neutral-300 bg-card px-3 text-sm focus:outline-none"
          >
            <option value="">Tous</option>
            <option value="active">Actif</option>
            <option value="suspended">Suspendu</option>
            <option value="banned">Banni</option>
          </select>
        </label>

        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-ink"
        >
          Filtrer
        </button>
      </form>

      {users.length > 0 ? (
        <ul className="space-y-3">
          {users.map((user) => (
            <li key={user.id}>
              <UserRow user={user} viewerRole={viewerRole} viewerId={viewer?.id ?? ''} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Users}
          title="Aucun compte ne correspond"
          description="Essayez d’élargir vos critères de recherche."
        />
      )}
    </div>
  );
}
