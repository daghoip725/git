/**
 * Test d'intégration : la documentation d'API décrit-elle la réalité ?
 *
 * Une documentation d'API qui dérive est **pire qu'une absence de
 * documentation**, parce qu'on lui fait confiance. On y lit une fonction qui
 * n'existe plus, on l'appelle, et l'erreur arrive à l'exécution — dans le
 * meilleur des cas chez le développeur, dans le pire chez l'utilisateur.
 *
 * Deux sens sont vérifiés, et ils n'ont pas le même statut :
 *
 *  1. **Toute fonction appelée par le code doit être documentée.** C'est le
 *     sens qui empêche la documentation de prendre du retard sur le code.
 *  2. **Toute fonction documentée doit exister en base.** C'est le sens qui
 *     empêche la documentation de mentir après une suppression.
 *
 * ## Ce que ce test ne peut pas voir
 *
 * L'extraction des appels est **statique** : elle repère `.rpc('nom')` et rien
 * d'autre. Un nom passé par une variable — il en existe deux, pour l'effacement
 * des historiques — lui échappe. C'est une limite assumée : la seule alternative
 * serait d'exécuter l'application, ce qui demanderait une base peuplée et
 * transformerait un contrôle instantané en recette complète.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOC = path.join(RACINE, 'docs/API.md');
const INTROSPECTION =
  process.env.IKASSA_SCHEMA_JSON ?? path.join(RACINE, 'supabase/tests/.schema.json');

if (!existsSync(INTROSPECTION)) {
  throw new Error(
    `Introspection absente (${INTROSPECTION}).\n` +
      'Ce test compare la documentation à une base réelle : lancez `npm run test:sql`.',
  );
}

const reel: { fonctions: string[] } = JSON.parse(readFileSync(INTROSPECTION, 'utf8'));

/* -------------------------------------------------------------------------- */
/*  Ce que le code appelle                                                    */
/* -------------------------------------------------------------------------- */

const DOSSIERS = ['app', 'components', 'lib', 'services', 'hooks'];

/**
 * Appels dont le nom est passé par une variable, invisibles à l'analyse
 * statique. Les tenir ici plutôt que de renoncer au contrôle : la liste est
 * courte, et l'oublier ferait passer une fonction non documentée.
 */
const APPELS_DYNAMIQUES = ['clear_search_history', 'clear_ad_views'];

function appelsDuCode(): Set<string> {
  const noms = new Set<string>(APPELS_DYNAMIQUES);

  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entree.name)) continue;

      const source = readFileSync(chemin, 'utf8');
      // `\s*` : l'appel est souvent réparti sur plusieurs lignes après un
      // formatage automatique.
      for (const trouve of source.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) {
        noms.add(trouve[1]!);
      }
    }
  };

  for (const dossier of DOSSIERS) parcourir(path.join(RACINE, dossier));
  return noms;
}

/* -------------------------------------------------------------------------- */
/*  Ce que la documentation déclare                                           */
/* -------------------------------------------------------------------------- */

/**
 * Noms figurant dans la première colonne des tableaux de la section « Fonctions
 * SQL (RPC) ».
 *
 * La lecture est bornée à cette section, et pas au fichier entier. Le premier
 * jet ne l'était pas, et récoltait `anon`, `authenticated` et `service_role` —
 * le tableau des rôles, dont la première colonne a exactement la même forme.
 * Une expression régulière ne distingue pas un nom de fonction d'un nom de
 * rôle ; sa **position** dans le document, si.
 */
function fonctionsDocumentees(): Set<string> {
  const lignes = readFileSync(DOC, 'utf8').split('\n');
  const noms = new Set<string>();

  const debut = lignes.findIndex((l) => /^##\s+Fonctions SQL/.test(l));
  assert.ok(debut >= 0, 'section « Fonctions SQL (RPC) » introuvable dans docs/API.md');

  for (const ligne of lignes.slice(debut + 1)) {
    // Fin de section : le titre de niveau 2 suivant.
    if (/^##\s/.test(ligne)) break;

    const trouve = ligne.match(/^\|\s*`([a-z0-9_]+)`\s*\|/);
    if (trouve) noms.add(trouve[1]!);
  }

  return noms;
}

/* -------------------------------------------------------------------------- */

const appelees = appelsDuCode();
const documentees = fonctionsDocumentees();
const existantes = new Set(reel.fonctions);

describe('documentation d’API', () => {
  it('lit effectivement les deux sources (garde-fou du test)', () => {
    /*
     * Sans ce contrôle, une expression régulière devenue inopérante — un
     * changement de format du tableau, un renommage de dossier — viderait les
     * deux ensembles et ferait passer toutes les comparaisons au vert sans rien
     * comparer.
     */
    assert.ok(appelees.size >= 40, `seulement ${appelees.size} appels repérés dans le code`);
    assert.ok(documentees.size >= 40, `seulement ${documentees.size} fonctions lues dans la doc`);
  });

  it('documente toutes les fonctions appelées par le code', () => {
    const absentes = [...appelees].filter((nom) => !documentees.has(nom)).sort();

    assert.deepEqual(
      absentes,
      [],
      `appelées mais absentes de docs/API.md : ${absentes.join(', ')}`,
    );
  });

  it('ne documente aucune fonction qui n’existe pas en base', () => {
    const fantomes = [...documentees].filter((nom) => !existantes.has(nom)).sort();

    assert.deepEqual(
      fantomes,
      [],
      `documentées mais absentes du schéma : ${fantomes.join(', ')}`,
    );
  });

  it('annonce un nombre de fonctions conforme à ce qu’elle liste', () => {
    /*
     * Le texte affirme « les 59 fonctions appelées par l'application ». Un
     * chiffre écrit en toutes lettres dans une documentation vieillit seul et
     * sans bruit : autant le vérifier.
     */
    const doc = readFileSync(DOC, 'utf8');
    const annonce = doc.match(/\*\*(\d+) fonctions appelées/);

    assert.ok(annonce, 'le nombre annoncé est introuvable dans docs/API.md');
    assert.equal(
      Number(annonce[1]),
      documentees.size,
      `la page annonce ${annonce[1]} fonctions et en liste ${documentees.size}`,
    );
  });
});
