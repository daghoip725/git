/**
 * Résolution de l'alias `@/` pour l'exécution des tests sous Node.
 *
 * L'alias est déclaré dans `tsconfig.json` et compris par Next.js, mais pas par
 * Node : hors du bundler, `@/utils/phone` n'est pas un chemin valide. Ce crochet
 * de résolution le réécrit vers la racine du projet.
 *
 * On préfère cela à des imports relatifs dans les tests (`../../utils/phone`) :
 * les tests doivent importer les modules exactement comme le fait le code de
 * production, sinon ils cessent d'attester ce qui tourne réellement.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extensions essayées dans l'ordre.
 *
 * Le code source écrit `@/lib/ai/tidy` sans extension, comme partout en
 * TypeScript ; Node, lui, exige un chemin de fichier complet.
 */
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  /*
   * `server-only` lève à l'import hors d'un contexte serveur. C'est un garde-fou
   * destiné au bundler — il fait échouer le build si un module serveur est tiré
   * dans un composant client — et il n'a pas de sens sous Node, où l'on exécute
   * précisément du code serveur. On le neutralise pour les tests.
   */
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export {}', shortCircuit: true };
  }

  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

  const base = path.join(ROOT, specifier.slice(2));

  for (const suffix of CANDIDATES) {
    try {
      return await nextResolve(pathToFileURL(base + suffix).href, context);
    } catch {
      // Extension suivante.
    }
  }

  throw new Error(`Alias non résolu : ${specifier}`);
}
