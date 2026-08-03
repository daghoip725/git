'use client';

/**
 * Actions sur un fil : archivage et blocage du correspondant.
 *
 * Le blocage demande une confirmation explicite — c'est une action qui coupe la
 * discussion des deux côtés, et un clic malheureux dans un menu ne doit pas
 * suffire à la déclencher.
 */
import { Archive, ArchiveRestore, Loader2, ShieldBan, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  blockUserAction,
  setConversationArchivedAction,
  unblockUserAction,
} from '@/app/actions/conversations.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface ConversationActionsProps {
  conversationId: string;
  correspondentId: string;
  correspondentName: string;
  isArchived: boolean;
  isBlocked: boolean;
}

export function ConversationActions({
  conversationId,
  correspondentId,
  correspondentName,
  isArchived,
  isBlocked,
}: ConversationActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Action impossible.');
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => setConversationArchivedAction(conversationId, !isArchived))}
        >
          {isArchived ? (
            <>
              <ArchiveRestore className="size-4" aria-hidden="true" />
              Désarchiver
            </>
          ) : (
            <>
              <Archive className="size-4" aria-hidden="true" />
              Archiver
            </>
          )}
        </Button>

        {isBlocked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => unblockUserAction(correspondentId))}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Débloquer
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirmBlock(true)}
          >
            <ShieldBan className="size-4" aria-hidden="true" />
            Bloquer
          </Button>
        )}

        {isPending ? (
          <Loader2
            className="size-4 animate-spin self-center text-neutral-500"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Modal
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title={`Bloquer ${correspondentName} ?`}
        description="Vous ne pourrez plus échanger de messages avec cette personne, dans un sens comme dans l’autre. Elle n’en sera pas informée."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmBlock(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isPending}
              onClick={() => {
                setConfirmBlock(false);
                run(() => blockUserAction(correspondentId, reason || null));
              }}
            >
              Bloquer
            </Button>
          </>
        }
      >
        <label htmlFor="block-reason" className="text-sm font-medium text-neutral-800">
          Motif (facultatif, visible de vous seul)
        </label>
        <input
          id="block-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          placeholder="Ex. propos déplacés"
          className="mt-1.5 h-11 w-full rounded-lg border border-neutral-300 px-3.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
        />
        <p className="mt-3 text-sm text-neutral-600">
          Si cette personne a enfreint les règles, pensez aussi à la signaler : le blocage ne
          prévient pas la modération.
        </p>
      </Modal>
    </div>
  );
}
