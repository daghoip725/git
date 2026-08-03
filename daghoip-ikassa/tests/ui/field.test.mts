/**
 * Champs de formulaire : câblage d'accessibilité.
 *
 * C'est le test de composant qui rapporte le plus, parce qu'il protège ce qui
 * casse le plus silencieusement. Un libellé détaché de son champ, un message
 * d'erreur qu'aucun lecteur d'écran n'annonce : rien ne se voit à l'écran, tout
 * se remarque à l'usage — et seulement par les personnes qui en dépendent.
 *
 * Les requêtes passent volontairement par les rôles et les noms accessibles
 * (`getByLabelText`, `getByRole`) plutôt que par des classes ou des
 * identifiants. Un test qui cherche `.input-error` continue de passer quand le
 * `aria-describedby` disparaît ; celui-ci échoue, ce qui est tout l'intérêt.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createElement as h } from 'react';

import { cleanup, render, screen } from '@testing-library/react';

import { Input, Textarea } from '@/components/ui/Field';

afterEach(cleanup);

describe('Input', () => {
  it('associe le libellé au champ', () => {
    render(h(Input, { label: 'Titre de l’annonce' }));

    // `getByLabelText` échoue si l'association `for`/`id` est rompue : c'est
    // exactement la régression qu'on veut attraper.
    const champ = screen.getByLabelText(/Titre de l’annonce/);
    assert.equal(champ.tagName, 'INPUT');
  });

  it('génère un identifiant unique par champ', () => {
    render(h('div', null, h(Input, { label: 'Ville' }), h(Input, { label: 'Quartier' })));

    const ville = screen.getByLabelText('Ville');
    const quartier = screen.getByLabelText('Quartier');

    // Deux champs partageant un identifiant rendraient l'un des deux libellés
    // inopérant — cliquer sur « Quartier » donnerait le focus à « Ville ».
    assert.notEqual(ville.id, quartier.id);
    assert.ok(ville.id);
  });

  it('respecte un identifiant fourni', () => {
    render(h(Input, { label: 'Prix', id: 'prix-annonce' }));
    assert.equal(screen.getByLabelText('Prix').id, 'prix-annonce');
  });

  it('rattache l’aide contextuelle au champ', () => {
    render(h(Input, { label: 'Téléphone', hint: 'Format gabonais, ex. 06 12 34 56' }));

    const champ = screen.getByLabelText('Téléphone');
    const aide = screen.getByText('Format gabonais, ex. 06 12 34 56');

    assert.equal(champ.getAttribute('aria-describedby'), aide.id);
    // Sans erreur, le champ n'est pas invalide.
    assert.equal(champ.getAttribute('aria-invalid'), null);
  });

  it('annonce l’erreur et marque le champ invalide', () => {
    render(h(Input, { label: 'Prix', error: 'Le prix doit être positif.' }));

    const champ = screen.getByLabelText('Prix');
    const erreur = screen.getByRole('alert');

    assert.equal(champ.getAttribute('aria-invalid'), 'true');
    assert.equal(champ.getAttribute('aria-describedby'), erreur.id);
    assert.equal(erreur.textContent, 'Le prix doit être positif.');
  });

  it('remplace l’aide par l’erreur, sans les cumuler', () => {
    render(
      h(Input, {
        label: 'Prix',
        hint: 'En francs CFA',
        error: 'Le prix doit être positif.',
      }),
    );

    /*
     * Les deux affichés ensemble, `aria-describedby` ne pointerait que sur
     * l'un : le lecteur d'écran lirait « En francs CFA » et tairait l'erreur.
     * L'aide s'efface donc quand l'erreur paraît.
     */
    assert.equal(screen.queryByText('En francs CFA'), null);
    assert.ok(screen.getByRole('alert'));
  });

  it('marque visuellement et sémantiquement un champ obligatoire', () => {
    render(h(Input, { label: 'Titre', required: true }));

    const champ = screen.getByLabelText(/Titre/);
    assert.equal(champ.hasAttribute('required'), true);

    // L'astérisque est décoratif : `required` porte déjà l'information, la
    // faire lire une seconde fois n'apporte rien qu'une gêne.
    const asterisque = screen.getByText('*', { exact: false, selector: 'span' });
    assert.equal(asterisque.getAttribute('aria-hidden'), 'true');
  });

  it('transmet les attributs natifs au champ', () => {
    render(
      h(Input, {
        label: 'Adresse e-mail',
        type: 'email',
        autoComplete: 'email',
        placeholder: 'vous@exemple.ga',
      }),
    );

    const champ = screen.getByLabelText('Adresse e-mail');
    assert.equal(champ.getAttribute('type'), 'email');
    assert.equal(champ.getAttribute('autocomplete'), 'email');
    assert.equal(champ.getAttribute('placeholder'), 'vous@exemple.ga');
  });
});

describe('Textarea', () => {
  it('applique le même câblage d’accessibilité', () => {
    render(h(Textarea, { label: 'Description', error: 'Trop courte.' }));

    const champ = screen.getByLabelText('Description');
    assert.equal(champ.tagName, 'TEXTAREA');
    assert.equal(champ.getAttribute('aria-invalid'), 'true');
    assert.equal(champ.getAttribute('aria-describedby'), screen.getByRole('alert').id);
  });

  it('accepte une hauteur explicite', () => {
    render(h(Textarea, { label: 'Description', rows: 3 }));
    assert.equal(screen.getByLabelText('Description').getAttribute('rows'), '3');
  });
});
