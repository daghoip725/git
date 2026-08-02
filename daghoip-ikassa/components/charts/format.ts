/**
 * Mise en forme des valeurs d'un graphique.
 *
 * Les composants de graphique sont rendus **depuis des Server Components** ;
 * React ne sait pas sérialiser une fonction à travers cette frontière. On passe
 * donc un descripteur — une chaîne — et la mise en forme s'applique côté
 * client. Ce n'est pas une limitation contournable : passer `format={…}` en
 * fonction fait échouer le rendu à l'exécution, pas à la compilation.
 */
import { formatPrice } from '@/utils/format';

export type ValueFormat = 'number' | 'currency';

export function formatValue(value: number, kind: ValueFormat = 'number'): string {
  return kind === 'currency' ? (formatPrice(value) ?? '0 FCFA') : value.toLocaleString('fr-GA');
}

/**
 * Version courte, pour les graduations de l'axe vertical.
 *
 * « 10 000 FCFA » ne tient pas dans la gouttière d'un petit graphique : la
 * mention débordait à gauche du cadre. L'unité appartient de toute façon au
 * titre, pas à chaque graduation ; la valeur exacte reste dans l'infobulle et
 * dans le tableau.
 */
export function formatAxisValue(value: number, scaleMax: number): string {
  // L'unité se décide **par graphique**, d'après le maximum de l'échelle, et
  // non valeur par valeur : un axe qui afficherait « 10 k » au-dessus de
  // « 5 000 » mélangerait deux unités sur la même règle.
  // Zéro reste « 0 » : « 0 k » n'apporte rien et se lit mal.
  if (value === 0) return '0';

  if (scaleMax >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-GA', { maximumFractionDigits: 1 })} M`;
  }
  if (scaleMax >= 10_000) {
    return `${Math.round(value / 1000).toLocaleString('fr-GA')} k`;
  }
  return value.toLocaleString('fr-GA');
}
