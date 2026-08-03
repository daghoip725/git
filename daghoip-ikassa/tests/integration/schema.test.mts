/**
 * Test d'intégration : le typage TypeScript décrit-il la base réelle ?
 *
 * `types/database.ts` est un **miroir écrit à la main** du schéma SQL. Un
 * miroir dérive. Et cette dérive-là est particulièrement sournoise : une
 * colonne ajoutée en SQL et oubliée côté TypeScript ne se voit nulle part —
 * `tsc` compile, les tests passent, la CI est verte — jusqu'à ce qu'une requête
 * échoue en production sur un champ que personne ne croyait absent. Dans
 * l'autre sens, une colonne déclarée en TypeScript mais retirée du SQL donne
 * une autocomplétion qui ment.
 *
 * Ce test rapproche les deux sources :
 *
 *   base réelle  ──►  supabase/tests/introspection.sql  ──►  .schema.json
 *   typage       ──►  API du compilateur TypeScript     ──►  déclarations
 *
 * Le typage est lu par le **compilateur TypeScript**, pas par des expressions
 * régulières : les types sont effacés à l'exécution, on ne peut pas les
 * importer, et un `grep` sur un fichier de 1 500 lignes se tromperait au
 * premier commentaire contenant une accolade.
 *
 * Il exige une base : c'est un test d'intégration, lancé par
 * `./supabase/tests/run.sh` après les suites SQL. Il **échoue** plutôt que de
 * se sauter si l'introspection manque — une suite qui se saute en silence est
 * le pire mode de défaillance possible, et ce projet s'y est déjà brûlé.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import ts from 'typescript';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/*
 * Chemin configurable : la suite SQL tourne sous un utilisateur dédié
 * (`initdb` refuse root), qui n'a pas forcément le droit d'écrire dans
 * l'arborescence du projet. Le runner lui passe alors un chemin temporaire.
 */
const INTROSPECTION =
  process.env.IKASSA_SCHEMA_JSON ?? path.join(RACINE, 'supabase/tests/.schema.json');
const TYPAGE = path.join(RACINE, 'types/database.ts');

interface Colonne {
  nom: string;
  type: string;
  nullable: boolean;
}

interface SchemaReel {
  enums: Record<string, string[]>;
  tables: Record<string, Colonne[]>;
  fonctions: string[];
}

if (!existsSync(INTROSPECTION)) {
  throw new Error(
    `Introspection absente (${INTROSPECTION}).\n` +
      'Ce test compare le typage à une base réelle : lancez `npm run test:sql`, ' +
      'qui démarre un PostgreSQL jetable et produit le fichier.',
  );
}

const reel: SchemaReel = JSON.parse(readFileSync(INTROSPECTION, 'utf8'));

/* -------------------------------------------------------------------------- */
/*  Lecture du typage par le compilateur                                      */
/* -------------------------------------------------------------------------- */

const source = ts.createSourceFile(
  TYPAGE,
  readFileSync(TYPAGE, 'utf8'),
  ts.ScriptTarget.ESNext,
  true,
);

/** Alias de type exportés qui sont des unions de littéraux : `'a' | 'b'`. */
const unions = new Map<string, string[]>();

/** Contenu du bloc `Enums:` — `nom_sql: AliasTypeScript`. */
const enumsDeclares = new Map<string, string>();

/** Colonnes déclarées par table : `Tables.<nom>.Row`. */
const tablesDeclarees = new Map<string, string[]>();

/** Noms des RPC déclarées dans `Functions`. */
const fonctionsDeclarees = new Set<string>();

function litteraux(node: ts.TypeNode): string[] | null {
  const collecte = (n: ts.TypeNode): string[] | null => {
    if (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal)) return [n.literal.text];
    if (ts.isUnionTypeNode(n)) {
      const parties = n.types.map(collecte);
      if (parties.some((p) => p === null)) return null;
      return parties.flat() as string[];
    }
    if (ts.isParenthesizedTypeNode(n)) return collecte(n.type);
    return null;
  };
  return collecte(node);
}

function membres(node: ts.TypeNode | undefined): string[] {
  if (!node || !ts.isTypeLiteralNode(node)) return [];
  return node.members
    .filter(ts.isPropertySignature)
    .map((membre) =>
      ts.isIdentifier(membre.name) || ts.isStringLiteral(membre.name) ? membre.name.text : '',
    )
    .filter(Boolean);
}

/** Retrouve un membre nommé dans un type littéral. */
function membre(node: ts.TypeNode | undefined, nom: string): ts.TypeNode | undefined {
  if (!node || !ts.isTypeLiteralNode(node)) return undefined;

  for (const m of node.members) {
    if (!ts.isPropertySignature(m)) continue;
    const cle = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : '';
    if (cle === nom) return m.type;
  }
  return undefined;
}

for (const declaration of source.statements) {
  if (ts.isTypeAliasDeclaration(declaration)) {
    const valeurs = litteraux(declaration.type);
    if (valeurs) unions.set(declaration.name.text, valeurs);
    continue;
  }

  if (!ts.isInterfaceDeclaration(declaration) || declaration.name.text !== 'Database') continue;

  const publicMembre = declaration.members
    .filter(ts.isPropertySignature)
    .find((m) => ts.isIdentifier(m.name) && m.name.text === 'public')?.type;

  // --- Enums ---------------------------------------------------------------
  const blocEnums = membre(publicMembre, 'Enums');
  if (blocEnums && ts.isTypeLiteralNode(blocEnums)) {
    for (const m of blocEnums.members) {
      if (!ts.isPropertySignature(m) || !m.type) continue;
      const nomSql = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : '';
      if (ts.isTypeReferenceNode(m.type) && ts.isIdentifier(m.type.typeName)) {
        enumsDeclares.set(nomSql, m.type.typeName.text);
      }
    }
  }

  // --- Tables --------------------------------------------------------------
  const blocTables = membre(publicMembre, 'Tables');
  if (blocTables && ts.isTypeLiteralNode(blocTables)) {
    for (const m of blocTables.members) {
      if (!ts.isPropertySignature(m) || !m.type) continue;
      const nomTable = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : '';
      tablesDeclarees.set(nomTable, membres(membre(m.type, 'Row')));
    }
  }

  // --- Functions -----------------------------------------------------------
  const blocFonctions = membre(publicMembre, 'Functions');
  for (const nom of membres(blocFonctions)) fonctionsDeclarees.add(nom);
}

/* -------------------------------------------------------------------------- */
/*  Comparaisons                                                              */
/* -------------------------------------------------------------------------- */

describe('typage ↔ schéma : énumérations', () => {
  it('lit effectivement le typage (garde-fou du test lui-même)', () => {
    /*
     * Si l'analyse échouait — un remaniement de `types/database.ts`, une
     * évolution de l'API du compilateur — toutes les boucles ci-dessous
     * porteraient sur des collections vides et passeraient au vert sans rien
     * comparer. Ce test-ci rend cette panne impossible à ignorer.
     */
    assert.ok(enumsDeclares.size >= 15, `seulement ${enumsDeclares.size} énumérations lues`);
    assert.ok(tablesDeclarees.size >= 15, `seulement ${tablesDeclarees.size} tables lues`);
    assert.ok(fonctionsDeclarees.size >= 20, `seulement ${fonctionsDeclarees.size} fonctions lues`);
  });

  it('déclare toutes les énumérations de la base', () => {
    const manquantes = Object.keys(reel.enums).filter((nom) => !enumsDeclares.has(nom));
    assert.deepEqual(manquantes, [], `énumérations SQL absentes du typage : ${manquantes}`);
  });

  it('ne déclare aucune énumération qui n’existe pas', () => {
    const fantomes = [...enumsDeclares.keys()].filter((nom) => !(nom in reel.enums));
    assert.deepEqual(fantomes, [], `énumérations typées mais absentes du SQL : ${fantomes}`);
  });

  it('donne exactement les mêmes valeurs', () => {
    for (const [nomSql, valeursSql] of Object.entries(reel.enums)) {
      const alias = enumsDeclares.get(nomSql);
      if (!alias) continue;

      const valeursTs = unions.get(alias);
      assert.ok(valeursTs, `l’alias ${alias} n’est pas une union de littéraux`);

      // Comparaison ensembliste : l'ordre d'un enum n'a pas de sens côté
      // TypeScript, seule l'appartenance en a un.
      assert.deepEqual(
        [...valeursTs].sort(),
        [...valeursSql].sort(),
        `valeurs divergentes pour ${nomSql}`,
      );
    }
  });
});

describe('typage ↔ schéma : colonnes', () => {
  it('ne manque aucune colonne des tables déclarées', () => {
    const ecarts: string[] = [];

    for (const [table, colonnesTs] of tablesDeclarees) {
      const colonnesSql = reel.tables[table];
      // Une table typée mais absente du SQL est signalée par le test suivant.
      if (!colonnesSql) continue;

      for (const colonne of colonnesSql) {
        /*
         * `search_vector` est une colonne générée, alimentée par PostgreSQL et
         * jamais lue par l'application : la déclarer n'apporterait qu'un champ
         * que personne ne doit toucher.
         */
        if (colonne.nom === 'search_vector') continue;

        if (!colonnesTs.includes(colonne.nom)) {
          ecarts.push(`${table}.${colonne.nom} (${colonne.type}) absente du typage`);
        }
      }
    }

    assert.deepEqual(ecarts, [], ecarts.join('\n'));
  });

  it('ne déclare aucune colonne fantôme', () => {
    const fantomes: string[] = [];

    for (const [table, colonnesTs] of tablesDeclarees) {
      const colonnesSql = reel.tables[table];
      if (!colonnesSql) {
        fantomes.push(`table ${table} typée mais absente du SQL`);
        continue;
      }

      const noms = new Set(colonnesSql.map((c) => c.nom));
      for (const colonne of colonnesTs) {
        if (!noms.has(colonne)) fantomes.push(`${table}.${colonne} typée mais absente du SQL`);
      }
    }

    assert.deepEqual(fantomes, [], fantomes.join('\n'));
  });
});

describe('typage ↔ schéma : fonctions', () => {
  it('ne déclare aucune RPC inexistante', () => {
    /*
     * Le sens qui compte. Une RPC déclarée mais absente de la base produit un
     * appel `supabase.rpc('…')` que TypeScript accepte et que PostgREST rejette
     * à l'exécution — l'erreur la plus coûteuse à diagnostiquer, parce que le
     * typage affirme le contraire.
     *
     * L'autre sens n'est pas vérifié : la base contient quantité de fonctions
     * internes (triggers, maintenance) que l'application n'a aucune raison de
     * déclarer.
     */
    const existantes = new Set(reel.fonctions);
    const fantomes = [...fonctionsDeclarees].filter((nom) => !existantes.has(nom));

    assert.deepEqual(fantomes, [], `RPC typées mais absentes du SQL : ${fantomes}`);
  });
});
