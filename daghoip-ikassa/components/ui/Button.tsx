import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  // `whitespace-nowrap` : sans lui, un libellé long placé dans un conteneur
  // flex contraint (l'en-tête) se replie sur plusieurs lignes et déborde de la
  // hauteur fixe du bouton.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold ' +
  'transition-colors disabled:pointer-events-none disabled:opacity-60 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-ink focus-visible:outline-brand-800',
  secondary: 'bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-brand-500',
  gold: 'bg-gold-500 text-brand-ink hover:bg-gold-600 hover:text-white focus-visible:outline-gold-600',
  outline:
    'border border-brand-800 bg-transparent text-brand-800 hover:bg-brand-50 focus-visible:outline-brand-800',
  ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100 focus-visible:outline-neutral-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  children?: ReactNode;
  className?: string;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** Indicateur de chargement inline (masqué des lecteurs d'écran). */
function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth,
    isLoading,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps {
  href: string;
  prefetch?: boolean;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}

/** Même apparence que `Button`, rendu comme lien de navigation. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </Link>
  );
}
