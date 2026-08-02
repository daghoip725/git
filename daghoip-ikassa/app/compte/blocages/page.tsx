import { ShieldBan } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { UnblockButton } from '@/components/messages/UnblockButton';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getBlockedUsers } from '@/services/conversations.service';
import { getAvatarUrl } from '@/services/storage.service';
import { formatLongDate } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Comptes bloqués',
  robots: { index: false, follow: false },
};

export default async function BlockedAccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/blocages');

  const blocked = await getBlockedUsers();

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-900">Comptes bloqués</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Vous n’échangez plus de messages avec ces comptes, dans un sens comme dans l’autre. Ils
          n’en sont pas informés.
        </p>
      </header>

      {blocked.length > 0 ? (
        <ul className="space-y-2">
          {blocked.map((account) => (
            <li
              key={account.user_id}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3"
            >
              <Avatar name={account.full_name} src={getAvatarUrl(account.avatar_path)} size={40} />

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-brand-900">{account.full_name}</p>
                <p className="text-xs text-neutral-500">
                  Bloqué le {formatLongDate(account.created_at)}
                  {account.reason ? ` · ${account.reason}` : ''}
                </p>
              </div>

              <UnblockButton userId={account.user_id} name={account.full_name} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ShieldBan}
          title="Aucun compte bloqué"
          description="Vous pouvez bloquer une personne depuis la conversation que vous avez avec elle."
          action={<ButtonLink href="/messages">Voir mes messages</ButtonLink>}
        />
      )}
    </div>
  );
}
