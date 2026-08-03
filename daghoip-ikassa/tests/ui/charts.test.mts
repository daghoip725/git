/**
 * Graphiques : lisibilité, échelle, et repli textuel.
 *
 * Deux propriétés valent d'être protégées ici, et aucune ne se voit dans un
 * diff :
 *
 *  1. **Le repli en tableau.** Un `<svg>` n'est pas lisible au lecteur d'écran,
 *     et une courbe ne se copie pas dans un tableur. Le tableau replié est ce
 *     qui rend le graphique exploitable autrement qu'à l'œil — et c'est
 *     précisément le genre de chose qu'un remaniement supprime sans que
 *     personne ne s'en aperçoive.
 *  2. **La mise à l'échelle.** Une division par zéro sur un jeu de données vide
 *     produit des coordonnées `NaN`, et un graphique qui disparaît sans erreur.
 *     Un tableau de bord tout neuf, sans aucune donnée, est exactement ce cas.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createElement as h } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { BarList } from '@/components/charts/BarList';
import { StatTile } from '@/components/charts/StatTile';
import { TrendChart } from '@/components/charts/TrendChart';

afterEach(cleanup);

const SERIE = [
  { day: '2026-07-01', value: 12 },
  { day: '2026-07-02', value: 0 },
  { day: '2026-07-03', value: 31 },
];

describe('TrendChart', () => {
  it('décrit la courbe à qui ne la voit pas', () => {
    render(h(TrendChart, { title: 'Vues', points: SERIE }));

    const image = screen.getByRole('img');
    const description = image.getAttribute('aria-label') ?? '';

    assert.match(description, /Vues/);
    // Le total et la durée figurent dans la description : sans eux, l'annonce
    // se réduirait à « Vues, image », ce qui n'apprend rien.
    assert.match(description, /43/);
    assert.match(description, /3 jours/);
  });

  it('replie un tableau, et le déplie à la demande', () => {
    render(h(TrendChart, { title: 'Contacts', points: SERIE }));

    const bascule = screen.getByRole('button', { name: /Voir le tableau/ });
    assert.equal(bascule.getAttribute('aria-expanded'), 'false');
    assert.equal(screen.queryByRole('table'), null);

    fireEvent.click(bascule);

    assert.equal(
      screen.getByRole('button', { name: /Masquer le tableau/ }).getAttribute('aria-expanded'),
      'true',
    );

    const tableau = screen.getByRole('table');
    // Toutes les valeurs de la série y figurent, y compris le jour creux :
    // un tableau qui sauterait les zéros mentirait autant qu'une courbe à trous.
    assert.match(tableau.textContent ?? '', /12/);
    assert.match(tableau.textContent ?? '', /31/);
    assert.equal((tableau.querySelectorAll('tbody tr') ?? []).length, SERIE.length);
  });

  it('ne produit AUCUNE coordonnée NaN sur une série vide', () => {
    /*
     * Le cas du tableau de bord tout neuf. Une division par zéro dans la mise à
     * l'échelle donne `NaN`, que le navigateur ignore en silence : le
     * graphique disparaît sans la moindre erreur en console.
     */
    const { container } = render(h(TrendChart, { title: 'Vues', points: [] }));

    for (const element of container.querySelectorAll('polyline, polygon, line, circle')) {
      for (const attribut of element.getAttributeNames()) {
        assert.ok(
          !element.getAttribute(attribut)?.includes('NaN'),
          `${element.tagName}.${attribut} contient NaN`,
        );
      }
    }
  });

  it('ne produit AUCUNE coordonnée NaN quand toutes les valeurs sont nulles', () => {
    // Variante plus vicieuse : la série existe, mais son maximum vaut zéro.
    const plates = SERIE.map((point) => ({ ...point, value: 0 }));
    const { container } = render(h(TrendChart, { title: 'Vues', points: plates }));

    const polyline = container.querySelector('polyline');
    assert.ok(polyline, 'la courbe doit être tracée même à plat');
    assert.ok(!polyline?.getAttribute('points')?.includes('NaN'));
  });

  it('trace un point unique sans échouer', () => {
    // `index / (points.length - 1)` divise par zéro avec un seul point.
    const { container } = render(
      h(TrendChart, { title: 'Vues', points: [{ day: '2026-07-01', value: 5 }] }),
    );

    const polyline = container.querySelector('polyline');
    assert.ok(!polyline?.getAttribute('points')?.includes('NaN'));
  });
});

describe('BarList', () => {
  it('affiche chaque entrée avec sa valeur', () => {
    render(
      h(BarList, {
        title: 'Vues par catégorie',
        items: [
          { label: 'Véhicules', value: 240 },
          { label: 'Immobilier', value: 180 },
        ],
      }),
    );

    assert.ok(screen.getByText('Véhicules'));
    assert.ok(screen.getByText('Immobilier'));
    // Les libellés sont écrits en toutes lettres à côté de leur barre : pas de
    // légende à décoder, pas de correspondance de couleurs à faire de tête.
    assert.match(screen.getByText('Véhicules').closest('li')?.textContent ?? '', /240/);
  });

  it('dit qu’il n’y a rien plutôt que d’afficher un cadre vide', () => {
    render(h(BarList, { title: 'Vues', items: [], emptyLabel: 'Aucune donnée pour l’instant.' }));
    assert.ok(screen.getByText('Aucune donnée pour l’instant.'));
  });

  it('supporte une valeur nulle sans barre de largeur NaN', () => {
    const { container } = render(
      h(BarList, { title: 'Vues', items: [{ label: 'Vide', value: 0 }] }),
    );

    for (const element of container.querySelectorAll('[style]')) {
      assert.ok(!element.getAttribute('style')?.includes('NaN'));
    }
  });
});

describe('StatTile', () => {
  it('met en forme les nombres à la locale gabonaise', () => {
    render(h(StatTile, { label: 'Vues', value: 12345 }));

    // Séparateur de milliers : « 12345 » se lit mal, et l'ordre de grandeur
    // est précisément ce qu'on vient chercher sur une vignette.
    const valeur = screen.getByText(/12/).textContent ?? '';
    assert.notEqual(valeur, '12345');
    assert.match(valeur, /12\s?345|12,345/);
  });

  it('laisse passer une valeur déjà mise en forme', () => {
    render(h(StatTile, { label: 'Recettes', value: '1,2 M FCFA' }));
    assert.ok(screen.getByText('1,2 M FCFA'));
  });

  it('devient un lien quand une destination est fournie', () => {
    render(h(StatTile, { label: 'Signalements', value: 3, href: '/admin/signalements' }));
    assert.equal(screen.getByRole('link').getAttribute('href'), '/admin/signalements');
  });

  it('reste un simple bloc sans destination', () => {
    render(h(StatTile, { label: 'Vues', value: 3 }));
    assert.equal(screen.queryByRole('link'), null);
  });
});
