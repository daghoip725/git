import Image from 'next/image';

import { cn } from '@/utils/cn';
import { getInitials } from '@/utils/format';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

/** Avatar avec repli sur les initiales quand aucune image n'est disponible. */
export function Avatar({ name, src, size = 44, className }: AvatarProps) {
  const dimension = { width: size, height: size };

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        {...dimension}
        className={cn('rounded-full object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={dimension}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800',
        className,
      )}
    >
      <span style={{ fontSize: Math.round(size * 0.38) }}>{getInitials(name)}</span>
    </span>
  );
}
