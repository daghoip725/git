/**
 * Chargement des composants `.tsx` sous Node, pour les tests.
 *
 * ## Pourquoi une dépendance ici, alors que le reste des tests n'en a aucune
 *
 * Le dépouillement de types de Node (`--experimental-strip-types`) retire les
 * annotations TypeScript, mais **ne transforme pas le JSX** : il n'est pas un
 * compilateur, et `<Button>` lui apparaît comme un opérateur de comparaison
 * suivi d'une expression — d'où l'erreur « Unterminated regexp literal ».
 *
 * Il n'y a donc pas d'alternative : tester un composant `.tsx` exige une
 * transformation JSX. C'est esbuild, choisi pour ce qu'il ne fait pas — pas de
 * configuration, pas de graphe de dépendances, pas de cache à invalider : un
 * fichier entre, du JavaScript sort.
 *
 * La règle « zéro dépendance ajoutée » valait pour les modules TypeScript purs,
 * et elle tient toujours : `npm run test:unit` n'a besoin de rien. C'est
 * `test:ui` seul qui paie ce prix, et il le paie pour une raison qu'aucune
 * astuce ne contourne.
 *
 * ## Ce que ce crochet ne fait pas
 *
 * Il ne vérifie **aucun type** : esbuild les jette sans les lire. C'est `tsc`
 * qui tient ce rôle, dans `npm run typecheck`. Un test qui passe ici n'atteste
 * donc rien sur le typage — seulement sur le comportement.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { transform } from 'esbuild';

import { resolve as resolveAlias } from './alias-hooks.mjs';

/**
 * Primitives Next remplacées par des doublures.
 *
 * Ces modules ne sont **pas résolubles par Node** hors bundler : leur champ
 * `exports` vise Webpack et Turbopack. Ce n'est donc pas un choix de test mais
 * une nécessité — sans doublure, tout composant qui affiche un lien refuse de
 * se charger.
 *
 * Chacune rend ce que Next rend (`<a>`, `<img>`) ou expose une API observable
 * (`useRouter`). Ce qu'elles ne reproduisent pas — préchargement, optimisation
 * d'image, navigation réelle — relève du framework et est testé par lui.
 */
const DOUBLURES = new Map([
  ['next/link', './stubs/next-link.mjs'],
  ['next/image', './stubs/next-image.mjs'],
  ['next/navigation', './stubs/next-navigation.mjs'],
]);

export async function resolve(specifier, context, nextResolve) {
  const doublure = DOUBLURES.get(specifier);
  if (doublure) {
    return {
      url: new URL(doublure, import.meta.url).href,
      shortCircuit: true,
    };
  }

  return resolveAlias(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.tsx')) {
    return nextLoad(url, context);
  }

  const source = await readFile(fileURLToPath(url), 'utf8');

  const { code } = await transform(source, {
    loader: 'tsx',
    format: 'esm',
    // `automatic` : les composants n'importent pas `React`, comme partout
    // depuis React 17. Le transformer en `classic` réclamerait un import que le
    // code de production n'a pas, et ferait échouer chaque fichier.
    jsx: 'automatic',
    // Conserve la correspondance avec le fichier d'origine : sans cela, une
    // pile d'appels de test pointe vers des lignes de code transformé, que
    // personne ne peut relire.
    sourcefile: fileURLToPath(url),
    sourcemap: 'inline',
    target: 'node22',
  });

  return { format: 'module', source: code, shortCircuit: true };
}
