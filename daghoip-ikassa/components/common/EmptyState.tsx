import { PackageSearch } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
}

/** État vide unifié (recherche sans résultat, liste vide, favoris vides…). */
export function EmptyState({
  title,
  description,
  icon: Icon = PackageSearch,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-14 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-800">
        <Icon className="size-7" />
      </span>
      <h3 className="text-base font-bold text-brand-900">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-neutral-600">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
