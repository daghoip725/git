/**
 * Nettoyage typographique du texte d'une annonce.
 *
 * Déterministe, sans réseau et sans clé : ce module fonctionne **toujours**,
 * même quand l'assistant de rédaction n'est pas configuré. Il ne corrige pas
 * l'orthographe — cela demande une compréhension de la langue qu'aucune règle
 * n'apporte — mais il traite ce qui relève de la mise en forme, et qui
 * représente en pratique la majorité de ce qui rend une annonce pénible à lire :
 *
 *   « TELEPHONE SAMSUNG NEUF!!!! prix 100000f à débattre ,urgent »
 *
 * Chaque règle est réversible et sans perte de sens : on ne réécrit jamais le
 * propos du vendeur, on ne fait que le rendre lisible. C'est aussi ce qui
 * permet de l'appliquer sans rien demander à personne.
 */

/** Longueur au-delà de laquelle un titre en capitales est considéré comme crié. */
const SHOUT_MIN_LENGTH = 12;

/** Ramène `!!!!` à `!`. À appliquer **avant** l'espacement français : une fois
 *  les points d'exclamation séparés par des espaces, ils ne se voient plus
 *  comme une répétition et l'on obtient « ! ! ! ! ». */
function collapseRepeats(value: string): string {
  return value.replace(/([!?.])\1{1,}/g, '$1');
}

/**
 * Remet un texte tout en capitales dans une casse normale.
 *
 * Les sigles courts (`4x4`, `TV`, `GPS`, `SUV`) sont préservés : les mettre en
 * minuscules serait une régression, pas une correction.
 */
function unshout(value: string): string {
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < SHOUT_MIN_LENGTH) return value;

  // Moins de 80 % de capitales : l'auteur alterne, on ne touche à rien.
  const uppercase = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  if (uppercase / letters.length < 0.8) return value;

  return value
    .toLocaleLowerCase('fr')
    .replace(/(^|[.!?]\s+|\n\s*)([a-zà-ÿ])/g, (_, prefix: string, letter: string) =>
      prefix + letter.toLocaleUpperCase('fr'),
    );
}

/**
 * Applique `unshout` **phrase par phrase**.
 *
 * Sur une ligne entière, « VENDS TELEPHONE EN BON ETAT. prix à débattre »
 * mélange assez de minuscules pour passer sous le seuil, et la partie criée
 * resterait telle quelle. Découpée en phrases, la première est traitée et la
 * seconde laissée intacte — ce qui est exactement le comportement attendu.
 */
function unshoutSentences(line: string): string {
  return line
    .split(/([.!?]+\s*)/)
    .map((segment) => (/[.!?]/.test(segment) ? segment : unshout(segment)))
    .join('');
}

/**
 * Applique l'espacement français : espace insécable avant `:` `;` `!` `?` `»`,
 * après `«`. Sans cela le texte « saute » visuellement à la lecture.
 */
function frenchSpacing(value: string): string {
  return value
    .replace(/\s*([;:!?])/g, ' $1')
    .replace(/«\s*/g, '« ')
    .replace(/\s*»/g, ' »')
    // La virgule et le point, eux, se collent au mot qui précède.
    .replace(/\s+([,.])/g, '$1')
    .replace(/([,.])(?=[^\s\d.])/g, '$1 ');
}

/** Sépare les milliers d'un montant écrit d'un bloc : `100000` → `100 000`. */
function spaceThousands(value: string): string {
  return value.replace(/\b(\d{4,9})\b(?!\s*[)\-/])/g, (match) =>
    match.replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
  );
}

export interface TidyResult {
  text: string;
  /** `true` si quelque chose a réellement changé. */
  changed: boolean;
}

/**
 * Nettoie un titre : une seule ligne, pas de cris, pas de ponctuation répétée.
 */
export function tidyTitle(input: string): TidyResult {
  const text = frenchSpacing(
    unshoutSentences(collapseRepeats(input.replace(/\s+/g, ' ').trim())),
  ).trim();

  return { text, changed: text !== input };
}

/**
 * Nettoie une description : paragraphes conservés, espaces et ponctuation
 * normalisés, montants rendus lisibles.
 *
 * Les sauts de ligne multiples sont ramenés à un seul paragraphe vide : un
 * vendeur qui appuie douze fois sur Entrée ne veut pas douze lignes vides, il
 * veut une séparation.
 */
export function tidyDescription(input: string): TidyResult {
  const text = input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      // Ordre non interchangeable : on réduit les répétitions, puis on décrie,
      // puis seulement on espace — l'espacement rendrait les deux premières
      // règles inopérantes.
      frenchSpacing(
        spaceThousands(unshoutSentences(collapseRepeats(line.replace(/[ \t]+/g, ' ').trim()))),
      ),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, changed: text !== input };
}
