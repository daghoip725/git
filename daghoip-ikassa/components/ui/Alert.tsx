import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<AlertTone, { wrapper: string; icon: typeof Info }> = {
  info: { wrapper: 'border-brand-200 bg-brand-50 text-brand-900', icon: Info },
  success: { wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  warning: { wrapper: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  error: { wrapper: 'border-red-200 bg-red-50 text-red-900', icon: XCircle },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Message d'état. Les alertes d'erreur portent `role="alert"` pour être
 * annoncées immédiatement par les lecteurs d'écran.
 */
export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const { wrapper, icon: Icon } = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3.5 text-sm', wrapper, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
    </div>
  );
}
