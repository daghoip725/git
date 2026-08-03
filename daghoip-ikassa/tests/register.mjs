/**
 * Enregistre les crochets de résolution avant le chargement des tests.
 *
 * Chargé via `--import`, donc exécuté avant tout `import` de module de test :
 * c'est la seule fenêtre où l'on peut encore installer un résolveur.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./alias-hooks.mjs', pathToFileURL(import.meta.filename));
