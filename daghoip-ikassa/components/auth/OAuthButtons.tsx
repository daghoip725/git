'use client';

/**
 * Connexion via un fournisseur externe.
 *
 * Le flux est initié côté serveur (`signInWithProviderAction`) pour que le
 * cookie de vérifieur PKCE soit posé par le serveur ; le navigateur n'a plus
 * qu'à suivre l'URL d'autorisation retournée.
 */
import { useState, useTransition } from 'react';

import { signInWithProviderAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/utils/cn';

export interface OAuthButtonsProps {
  /** Chemin interne vers lequel revenir après authentification. */
  next?: string;
  className?: string;
}

/** Logos officiels, inlinés : aucune requête vers un domaine tiers. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" focusable="false">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z"
      />
    </svg>
  );
}

const PROVIDERS = [
  { id: 'google', label: 'Continuer avec Google', Logo: GoogleLogo },
  { id: 'facebook', label: 'Continuer avec Facebook', Logo: FacebookLogo },
] as const;

export function OAuthButtons({ next, className }: OAuthButtonsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleClick(provider: string) {
    setError(null);
    setPendingProvider(provider);

    startTransition(async () => {
      const result = await signInWithProviderAction(provider, next);
      if (result.success) {
        // Redirection vers le fournisseur : navigation complète, pas de router.
        window.location.assign(result.data.url);
      } else {
        setError(result.error);
        setPendingProvider(null);
      }
    });
  }

  return (
    <div className={cn('space-y-2', className)}>
      {PROVIDERS.map(({ id, label, Logo }) => (
        <button
          key={id}
          type="button"
          onClick={() => handleClick(id)}
          disabled={pendingProvider !== null}
          className={cn(
            'flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-neutral-300',
            'bg-white text-sm font-semibold text-neutral-700 transition-colors',
            'hover:bg-neutral-50 disabled:opacity-60',
          )}
        >
          <Logo />
          {pendingProvider === id ? 'Redirection…' : label}
        </button>
      ))}

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

/** Séparateur « ou » entre les méthodes de connexion. */
export function AuthDivider({ label = 'ou' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-neutral-200" />
      <span className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{label}</span>
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}
