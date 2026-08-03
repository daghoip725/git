/**
 * Contrôles de la projection Web Mercator (`utils/map.ts`).
 *
 *   npm run check:map        (nécessite Node 22.6+ pour l'exécution directe du TS)
 *
 * Ces fonctions n'ont aucune dépendance et aucun rendu : une erreur de signe ou
 * de facteur y passerait inaperçue à l'œil, mais décalerait la carte de
 * plusieurs kilomètres. Les repères choisis sont vérifiables de tête (quadrants
 * du monde au zoom 1), et l'aller-retour utilise la formule inverse canonique
 * d'OpenStreetMap, indépendante de celle qui est testée.
 */
import { lonToWorldX, latToWorldY, metersPerPixel, buildTileUrl, TILE_SIZE } from './map.ts';

let fails = 0;
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'ECHEC'}  ${label}`);
  if (!cond) fails++;
};

const tileX = (lon: number, z: number) => Math.floor(lonToWorldX(lon, z) / TILE_SIZE);
const tileY = (lat: number, z: number) => Math.floor(latToWorldY(lat, z) / TILE_SIZE);

// --- Quadrants au zoom 1 : signe de la longitude et de la latitude ---
ok('z1 Londres (51.5,-0.13) -> (0,0)', tileX(-0.13, 1) === 0 && tileY(51.5, 1) === 0);
ok('z1 Berlin (52.5,13.4)   -> (1,0)', tileX(13.4, 1) === 1 && tileY(52.5, 1) === 0);
ok('z1 Sydney (-33.9,151.2) -> (1,1)', tileX(151.2, 1) === 1 && tileY(-33.9, 1) === 1);
ok('z1 Rio (-22.9,-43.2)    -> (0,1)', tileX(-43.2, 1) === 0 && tileY(-22.9, 1) === 1);

// --- Libreville au zoom 2 : (2,1) ---
ok('z2 Libreville (0.39,9.45) -> (2,1)', tileX(9.45, 2) === 2 && tileY(0.39, 2) === 1);

// --- Point nul au centre du monde, à tout zoom ---
for (const z of [0, 5, 12, 17]) {
  const half = (TILE_SIZE * 2 ** z) / 2;
  ok(
    `z${z} (0,0) au centre du monde`,
    Math.abs(lonToWorldX(0, z) - half) < 1e-6 && Math.abs(latToWorldY(0, z) - half) < 1e-6,
  );
}

// --- Aller-retour avec la formule inverse canonique d'OpenStreetMap ---
const invLon = (worldX: number, z: number) => (worldX / (TILE_SIZE * 2 ** z)) * 360 - 180;
const invLat = (worldY: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / (TILE_SIZE * 2 ** z)))) * 180) / Math.PI;

const points = [
  [0.416, 9.467],
  [-0.72, 8.78],
  [48.85, 2.35],
  [-33.87, 151.21],
  [64.13, -21.9],
];
for (const [lat, lon] of points as [number, number][]) {
  for (const z of [3, 10, 15, 17]) {
    const backLon = invLon(lonToWorldX(lon, z), z);
    const backLat = invLat(latToWorldY(lat, z), z);
    ok(
      `z${z} aller-retour ${lat},${lon}`,
      Math.abs(backLon - lon) < 1e-9 && Math.abs(backLat - lat) < 1e-9,
    );
  }
}

// --- Échelle au sol : référence connue à l'équateur, zoom 0 ---
ok('156543 m/px à l’équateur au zoom 0', Math.abs(metersPerPixel(0, 0) - 156543.03392) < 1e-4);
ok(
  'l’échelle est divisée par 2 à chaque zoom',
  Math.abs(metersPerPixel(0, 5) * 2 - metersPerPixel(0, 4)) < 1e-6,
);
ok('l’échelle diminue avec la latitude', metersPerPixel(60, 10) < metersPerPixel(0, 10));

// --- Gabarit de tuiles ---
ok(
  'gabarit remplacé',
  buildTileUrl('https://t/{z}/{x}/{y}.png', 3, 4, 5) === 'https://t/5/3/4.png',
);
ok(
  'abscisse repliée modulo le tour du monde',
  buildTileUrl('https://t/{z}/{x}/{y}.png', -1, 0, 2) === 'https://t/2/3/0.png',
);
ok('ordonnée hors bornes écartée', buildTileUrl('https://t/{z}/{x}/{y}.png', 0, 4, 2) === null);
ok('ordonnée négative écartée', buildTileUrl('https://t/{z}/{x}/{y}.png', 0, -1, 2) === null);

console.log(fails === 0 ? '\nTOUS LES CONTRÔLES PASSÉS' : `\n${fails} ÉCHEC(S)`);
process.exit(fails === 0 ? 0 : 1);
