/**
 * Doublure de `next/image`.
 *
 * Rend une balise `<img>` nue. L'optimisation d'image — formats, tailles,
 * chargement différé — relève du serveur Next et ne se vérifie pas dans jsdom,
 * qui ne charge aucune image et ne peint rien.
 *
 * Les attributs propres à Next (`fill`, `priority`, `sizes`, `quality`) sont
 * absorbés : les laisser passer sur un `<img>` produirait des avertissements
 * React sur des attributs inconnus, du bruit qui finirait par masquer les vrais.
 */
import { createElement } from 'react';

export default function Image({
  src,
  alt,
  fill: _fill,
  priority: _priority,
  quality: _quality,
  placeholder: _placeholder,
  blurDataURL: _blur,
  loader: _loader,
  unoptimized: _unoptimized,
  ...rest
}) {
  return createElement('img', { src: typeof src === 'string' ? src : '', alt: alt ?? '', ...rest });
}
