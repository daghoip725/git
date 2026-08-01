'use client';

/** Bascule entre la connexion par e-mail et la connexion par SMS. */
import { AtSign, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface AuthMethodTabsProps {
  emailPanel: ReactNode;
  phonePanel: ReactNode;
  defaultMethod?: 'email' | 'phone';
}

const TABS = [
  { id: 'email', label: 'E-mail', icon: AtSign },
  { id: 'phone', label: 'Téléphone', icon: Smartphone },
] as const;

export function AuthMethodTabs({
  emailPanel,
  phonePanel,
  defaultMethod = 'email',
}: AuthMethodTabsProps) {
  const [method, setMethod] = useState<'email' | 'phone'>(defaultMethod);

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Méthode de connexion"
        className="flex gap-1 rounded-lg bg-neutral-100 p-1"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={method === id}
            aria-controls={`panel-${id}`}
            onClick={() => setMethod(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              method === id
                ? 'bg-white text-brand-800 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-800',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-email" aria-labelledby="tab-email" hidden={method !== 'email'}>
        {method === 'email' ? emailPanel : null}
      </div>
      <div role="tabpanel" id="panel-phone" aria-labelledby="tab-phone" hidden={method !== 'phone'}>
        {method === 'phone' ? phonePanel : null}
      </div>
    </div>
  );
}
