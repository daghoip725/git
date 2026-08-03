/**
 * Doublure de `next/link`.
 *
 * `next/link` n'est pas résoluble par Node hors bundler : son champ `exports`
 * vise Webpack et Turbopack. La doublure rend l'ancre que Next rend lui aussi,
 * ce qui suffit à ce que les tests vérifient — qu'un lien existe, où il pointe,
 * et quel est son texte accessible.
 *
 * Elle ne reproduit ni le préchargement ni la navigation côté client : ce sont
 * des comportements de framework, testés par Next, pas par nous.
 */
import { createElement } from 'react';

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  ...rest
}) {
  return createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children);
}
