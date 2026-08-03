/**
 * Environnement DOM pour les tests de composants.
 *
 * ## Pourquoi une exécution séparée de `npm run test:unit`
 *
 * Installer `window` globalement casserait les tests non-DOM, et pas de façon
 * visible : `getServerEnv()` **lève** dès que `window` existe — c'est le
 * garde-fou qui empêche un secret de partir au navigateur. Un jsdom chargé
 * pour tout le monde ferait donc échouer les tests de configuration, ou pire,
 * les ferait passer en testant autre chose que le chemin de production.
 *
 * Les deux mondes restent donc séparés : `test:unit` sans DOM, `test:ui` avec.
 *
 * ## Ce qui est simulé, et ce qui ne l'est pas
 *
 * jsdom fournit le DOM, pas un navigateur : ni disposition, ni peinture, ni
 * couleurs calculées. Ces tests attestent la **structure** produite et le
 * comportement au clic — pas l'apparence. Ce qui relève du rendu réel
 * (contraste, débordement, tailles de police) se vérifie dans un vrai
 * navigateur, et se documente comme tel.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';

// `tsx-hooks` réexporte le résolveur d'alias et ajoute la transformation JSX.
register('./tsx-hooks.mjs', pathToFileURL(import.meta.filename));

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://daghoip-ikassa.test/',
  pretendToBeVisual: true,
});

/*
 * Recopie des propriétés de `window` absentes de `globalThis`.
 *
 * React et Testing Library en attendent une bonne partie sous forme de
 * globales (`document`, `Node`, `Event`, `getComputedStyle`…). On ne recopie
 * que ce qui manque : écraser `fetch` ou `URL`, fournis par Node dans des
 * versions plus complètes, priverait les tests de comportements réels.
 */
/*
 * `defineProperty` et non affectation directe : depuis Node 21, `navigator`
 * est une globale en lecture seule (accesseur sans mutateur), et
 * `globalThis.navigator = …` lève un `TypeError` avant même le premier test.
 */
for (const [cle, valeur] of [
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
]) {
  Object.defineProperty(globalThis, cle, { value: valeur, writable: true, configurable: true });
}

for (const cle of Object.getOwnPropertyNames(dom.window)) {
  if (cle in globalThis) continue;
  if (cle.startsWith('_')) continue;

  Object.defineProperty(globalThis, cle, {
    get: () => dom.window[cle],
    configurable: true,
  });
}

/*
 * React 19 lit ce drapeau pour savoir s'il tourne dans un environnement de
 * test : sans lui, chaque mise à jour d'état hors `act()` produit un
 * avertissement, et le bruit finit par masquer les vrais.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
