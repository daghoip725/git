#!/usr/bin/env node
/**
 * Budget de poids : vérifie ce que chaque page fait télécharger.
 *
 *     npm run build && npm run verify:perf
 *     npm run verify:perf -- --detail    # toutes les routes, pas seulement les pires
 *
 * ## Pourquoi un budget plutôt qu'une mesure
 *
 * Mesurer un temps de chargement demande un réseau, une machine et un moment
 * précis : le résultat varie d'une exécution à l'autre, et un seuil dessus
 * déclenche des alertes qui n'apprennent rien. Le **poids**, lui, est
 * déterministe : le même code produit exactement les mêmes octets. Il ne dit
 * pas combien de secondes attend l'utilisateur, mais il dit tout de ce que la
 * page lui impose de télécharger — et sur une connexion mobile gabonaise, c'est
 * le facteur qui domine tous les autres.
 *
 * Ce que ce script **ne** vérifie **pas** : le temps de rendu, le travail du
 * processeur, les requêtes réseau à l'exécution, les Core Web Vitals. Ceux-là
 * demandent un vrai navigateur et une vraie base ; ils se mesurent en recette,
 * pas en intégration continue.
 *
 * ## Ce qui est compté
 *
 * Le JavaScript de **premier chargement** d'une route : les fragments que le
 * navigateur doit avoir avant de pouvoir afficher et hydrater la page, dédupliqués
 * (un fragment partagé par dix routes n'est téléchargé qu'une fois, mais il pèse
 * sur chacune au premier accès).
 *
 * Les tailles sont **gzippées**, parce que c'est ce qui transite réellement. Le
 * poids sur disque n'a jamais atteint personne.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = path.join(RACINE, '.next');
const MANIFESTE = path.join(NEXT, 'app-build-manifest.json');

const detail = process.argv.includes('--detail');

/* -------------------------------------------------------------------------- */
/*  Budgets                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Plafonds, en kilo-octets gzippés.
 *
 * Calés sur les mesures réelles du projet **avec de la marge**, pas sur un
 * chiffre rond trouvé ailleurs : un budget déjà dépassé le jour où on l'écrit
 * ne sert à rien, et un budget trop large ne se déclenche jamais.
 *
 * Leur rôle n'est pas de faire maigrir l'application aujourd'hui — c'est de
 * rendre une régression **visible le jour où elle arrive**. Une bibliothèque de
 * graphiques ajoutée par confort, un import qui tire tout un paquet au lieu
 * d'une fonction : ces choses-là ne se voient pas dans un diff, elles se voient
 * ici.
 */
const BUDGETS = {
  /**
   * Socle partagé par toutes les pages : le plus coûteux à laisser grossir,
   * puisque chaque visiteur le paie quelle que soit la page d'arrivée.
   * Mesuré à 99,8 ko — 110 laisse la marge d'une évolution, pas d'une
   * bibliothèque.
   */
  partage: 110,

  /**
   * Route ordinaire. La plus lourde du projet pèse 229 ko : le plafond est
   * posé juste au-dessus, à dessein.
   *
   * Un budget se cale sur ce qu'on mesure, jamais sur un chiffre rond décidé
   * d'avance — trop bas il est déjà dépassé le jour où on l'écrit, trop haut
   * il ne se déclenche jamais. Sa raison d'être est de rendre visible
   * l'ajout qui ne se voit pas dans un diff : une bibliothèque de graphiques
   * prise par confort, un import qui tire un paquet entier au lieu d'une
   * fonction.
   */
  route: 240,

  /**
   * Plafonds relevés, avec leur motif.
   *
   * Vide aujourd'hui, et c'est le bon état : aucune route ne dépasse le
   * plafond commun. Toute entrée ajoutée ici doit porter sa raison — une
   * liste d'exceptions sans motif finit par absorber n'importe quelle
   * régression.
   */
  exceptions: {
    // '/exemple/page': { plafond: 320, motif: 'Pourquoi cette page pèse plus' },
  },
};

/**
 * Pourquoi certaines routes sont lourdes.
 *
 * Purement informatif : n'autorise rien, n'élève aucun plafond. Sert à ce que
 * la lecture du rapport n'oblige pas à rouvrir le code pour comprendre.
 */
const MOTIFS = {
  '/annonces/nouvelle/page': 'Carte de repérage et téléversement multiple',
  '/compte/annonces/[id]/modifier/page': 'Même formulaire que le dépôt',
  '/annonces/[slug]/page': 'Galerie photos et carte',
  '/compte/profil/page': 'Recadrage d’avatar',
  '/messages/[id]/page': 'Fil temps réel, émojis, pièces jointes',
  '/messages/page': 'Liste temps réel',
  '/annonces/page': 'Filtres, tri et recherche instantanée',
};

/* -------------------------------------------------------------------------- */

if (!existsSync(MANIFESTE)) {
  console.error(
    'Aucune construction trouvée (.next/app-build-manifest.json).\n' +
      'Lancez `npm run build` avant `npm run verify:perf`.',
  );
  process.exit(1);
}

/** Taille gzippée d'un fichier, en octets. */
const cacheTailles = new Map();
async function tailleGzip(relatif) {
  if (cacheTailles.has(relatif)) return cacheTailles.get(relatif);

  const complet = path.join(NEXT, relatif);
  if (!existsSync(complet) || !statSync(complet).isFile()) {
    cacheTailles.set(relatif, 0);
    return 0;
  }

  let octets = 0;
  const compteur = new (await import('node:stream')).Writable({
    write(morceau, _encodage, suite) {
      octets += morceau.length;
      suite();
    },
  });

  await pipeline(createReadStream(complet), createGzip({ level: 9 }), compteur);

  cacheTailles.set(relatif, octets);
  return octets;
}

const ko = (octets) => Math.round((octets / 1024) * 10) / 10;

const manifeste = JSON.parse(readFileSync(MANIFESTE, 'utf8'));

/*
 * Seules les **pages**. Le manifeste contient aussi les gabarits (`/layout`),
 * les gestionnaires de route (`/…/route`) et les états de chargement : les
 * compter comme des routes faisait apparaître `/layout` en tête du classement,
 * avec un poids qui n'est celui d'aucune page réelle.
 */
const routes = Object.entries(manifeste.pages).filter(([nom]) => nom.endsWith('/page'));

/*
 * Socle partagé : les fragments présents dans **toutes** les routes. C'est ce
 * que paie le tout premier visiteur, quelle que soit la page où il arrive.
 */
const partage =
  routes.length > 0
    ? routes
        .map(([, fichiers]) => new Set(fichiers))
        .reduce((commun, suivant) => new Set([...commun].filter((f) => suivant.has(f))))
    : new Set();

let poidsPartage = 0;
for (const fichier of partage) poidsPartage += await tailleGzip(fichier);

const mesures = [];
for (const [route, fichiers] of routes) {
  let total = 0;
  for (const fichier of new Set(fichiers)) total += await tailleGzip(fichier);

  const exception = BUDGETS.exceptions[route];
  mesures.push({
    route,
    poids: total,
    plafond: exception?.plafond ?? BUDGETS.route,
    motif: exception?.motif ?? MOTIFS[route],
  });
}

mesures.sort((a, b) => b.poids - a.poids);

/* -------------------------------------------------------------------------- */
/*  Rapport                                                                   */
/* -------------------------------------------------------------------------- */

console.log('\nPoids de premier chargement (gzippé)\n===================================\n');

const depassements = mesures.filter((m) => ko(m.poids) > m.plafond);

console.log(
  `  Socle partagé  ${String(ko(poidsPartage)).padStart(7)} ko` +
    `   / ${BUDGETS.partage} ko` +
    (ko(poidsPartage) > BUDGETS.partage ? '   DÉPASSEMENT' : ''),
);
console.log(`  Routes         ${String(mesures.length).padStart(7)}\n`);

const aAfficher = detail ? mesures : mesures.slice(0, 10);
for (const { route, poids, plafond, motif } of aAfficher) {
  const marque = ko(poids) > plafond ? 'DÉPASSEMENT' : '';
  console.log(
    `  ${String(ko(poids)).padStart(7)} ko / ${String(plafond).padStart(3)} ko  ${route}` +
      (motif ? `   (${motif})` : '') +
      (marque ? `   ${marque}` : ''),
  );
}

if (!detail && mesures.length > aAfficher.length) {
  console.log(`\n  … ${mesures.length - aAfficher.length} routes plus légères (--detail).`);
}

const socleDepasse = ko(poidsPartage) > BUDGETS.partage;

if (depassements.length === 0 && !socleDepasse) {
  console.log('\n  Tous les budgets sont tenus.\n');
  process.exit(0);
}

console.log(
  `\n  ${depassements.length} route(s) hors budget${socleDepasse ? ', socle partagé compris' : ''}.`,
);
console.log(
  '  Si la hausse est justifiée, relevez le plafond dans scripts/verifier-perf.mjs\n' +
    '  en écrivant le motif — un budget qu’on relève sans rien dire ne mesure plus rien.\n',
);
process.exit(1);
