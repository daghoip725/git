import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

export type BadgeTone = 'brand' | 'gold' | 'neutral' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  gold: 'bg-gold-50 text-gold-800 ring-gold-300',
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
