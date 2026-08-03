import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Concatène des classes conditionnelles puis résout les conflits Tailwind
 * (la dernière classe de la même famille gagne).
 *
 * @example cn('px-2 py-1', isLarge && 'px-4') // -> 'py-1 px-4'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
