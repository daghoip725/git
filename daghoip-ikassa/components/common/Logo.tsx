import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/utils/cn';
import { SITE } from '@/utils/constants';

export interface LogoProps {
  /** `full` affiche le nom à côté du symbole, `mark` le symbole seul. */
  variant?: 'full' | 'mark';
  size?: number;
  href?: string | null;
  className?: string;
  /** Texte clair, pour un usage sur fond vert. */
  inverted?: boolean;
}

/**
 * Identité visuelle officielle de Daghoip Ikassa.
 * Le fichier source est `public/logo-daghoip-ikassa.png`.
 */
export function Logo({
  variant = 'full',
  size = 40,
  href = '/',
  className,
  inverted = false,
}: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src={SITE.logo}
        alt=""
        width={size}
        height={size}
        priority
        className="shrink-0 object-contain"
      />
      {variant === 'full' ? (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'text-lg font-extrabold tracking-tight',
              inverted ? 'text-white' : 'text-brand-800',
            )}
          >
            Daghoip
          </span>
          <span
            className={cn(
              'text-sm font-bold tracking-wide',
              inverted ? 'text-gold-300' : 'text-gold-600',
            )}
          >
            Ikassa
          </span>
        </span>
      ) : null}
      <span className="sr-only">{SITE.name}</span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={`${SITE.name} — accueil`} className="inline-flex">
      {content}
    </Link>
  );
}
