'use client';

/** Retire un blocage depuis la liste des comptes bloqués. */
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { unblockUserAction } from '@/app/actions/conversations.actions';
import { Button } from '@/components/ui/Button';

export interface UnblockButtonProps {
  userId: string;
  name: string;
}

export function UnblockButton({ userId, name }: UnblockButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="shrink-0 text-right">
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={isPending}
        aria-label={`Débloquer ${name}`}
        onClick={() =>
          startTransition(async () => {
            const result = await unblockUserAction(userId);
            if (result.success) router.refresh();
            else setError(result.error);
          })
        }
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        Débloquer
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
