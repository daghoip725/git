/**
 * Choix de la langue : bascule optimiste et retour arrière.
 *
 * C'est le comportement le plus facile à casser du composant, et le plus
 * pénible à l'usage : la pastille suit le clic **avant** la réponse du serveur,
 * pour qu'un réseau lent ne donne pas l'impression d'un bouton mort. Le
 * corollaire, seul vraiment délicat, est qu'un refus doit **revenir en
 * arrière** — sans quoi l'interface affiche durablement une langue qui n'a pas
 * été enregistrée.
 *
 * La Server Action est remplacée par une doublure : l'importer vraiment
 * tirerait `next/headers`, `next/cache` et le client Supabase, qui n'ont aucun
 * sens sous jsdom. Ce qu'on teste ici est le composant, pas l'action — celle-ci
 * a ses propres garanties côté base.
 *
 * `--experimental-test-module-mocks` est nécessaire : c'est la seule façon
 * d'intercepter un module ES sans réécrire le code de production pour le
 * rendre testable, ce qui reviendrait à tester autre chose que ce qui tourne.
 */
import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement as h } from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { calls, reset as resetRouter } from '../stubs/next-navigation.mjs';

/** Réponse que la doublure d'action renverra au prochain appel. */
let reponse: { success: boolean; error?: string; data?: unknown } = {
  success: true,
  data: { locale: 'en' },
};
/** Langues demandées, dans l'ordre. */
let demandes: unknown[] = [];

let LanguageForm: typeof import('@/components/account/LanguageForm').LanguageForm;

before(async () => {
  mock.module('@/app/actions/settings.actions', {
    namedExports: {
      setLanguageAction: async (locale: unknown) => {
        demandes.push(locale);
        return reponse;
      },
    },
  });

  ({ LanguageForm } = await import('@/components/account/LanguageForm'));
});

const LIBELLES = {
  title: 'Langue de l’interface',
  help: 'Change les menus et les formulaires.',
  saved: 'Langue enregistrée.',
  error: 'Impossible d’enregistrer la langue.',
};

afterEach(() => {
  cleanup();
  demandes = [];
  reponse = { success: true, data: { locale: 'en' } };
  resetRouter();
});

describe('LanguageForm', () => {
  it('marque la langue courante comme sélectionnée', () => {
    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    // `aria-pressed` et non une classe CSS : c'est ce qui dit à un lecteur
    // d'écran laquelle des deux langues est active.
    assert.equal(
      screen.getByRole('button', { name: /Français/, pressed: true }).getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      screen.getByRole('button', { name: /English/ }).getAttribute('aria-pressed'),
      'false',
    );
  });

  it('écrit chaque langue dans sa propre langue', () => {
    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    // « English » et non « Anglais » : on ne cherche pas sa langue dans une
    // liste écrite dans celle qu'on ne lit pas.
    assert.ok(screen.getByRole('button', { name: /English/ }));
    assert.equal(screen.queryByRole('button', { name: /Anglais/ }), null);
  });

  it('bascule immédiatement, puis confirme', async () => {
    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /English/ }));
    });

    assert.deepEqual(demandes, ['en']);
    assert.equal(
      screen.getByRole('button', { name: /English/ }).getAttribute('aria-pressed'),
      'true',
    );
    assert.ok(screen.getByText('Langue enregistrée.'));
  });

  it('rafraîchit la page pour que le reste de l’interface suive', async () => {
    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /English/ }));
    });

    // Sans ce rafraîchissement, la navigation et le pied de page resteraient
    // dans l'ancienne langue jusqu'au prochain chargement complet.
    assert.equal(calls.refresh, 1);
  });

  it('REVIENT en arrière quand le serveur refuse', async () => {
    reponse = { success: false, error: 'Langue inconnue.' };

    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /English/ }));
    });

    /*
     * Le cœur du test. Sans retour arrière, l'interface affirmerait durablement
     * être en anglais alors que rien n'a été enregistré — et le rechargement
     * suivant démentirait sans explication.
     */
    assert.equal(
      screen.getByRole('button', { name: /Français/ }).getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      screen.getByRole('button', { name: /English/ }).getAttribute('aria-pressed'),
      'false',
    );
    assert.ok(screen.getByText('Langue inconnue.'));
    assert.equal(screen.queryByText('Langue enregistrée.'), null);
    // Rien n'a changé : rafraîchir afficherait la page telle qu'elle est déjà.
    assert.equal(calls.refresh, 0);
  });

  it('n’appelle rien lorsqu’on reclique la langue déjà active', async () => {
    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Français/ }));
    });

    assert.deepEqual(demandes, []);
    assert.equal(calls.refresh, 0);
  });

  it('efface l’erreur précédente à la tentative suivante', async () => {
    reponse = { success: false, error: 'Langue inconnue.' };
    render(h(LanguageForm, { current: 'fr', labels: LIBELLES }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /English/ }));
    });
    assert.ok(screen.getByText('Langue inconnue.'));

    reponse = { success: true, data: { locale: 'en' } };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /English/ }));
    });

    // Un message d'erreur qui survit à une réussite est un mensonge affiché.
    assert.equal(screen.queryByText('Langue inconnue.'), null);
    assert.ok(screen.getByText('Langue enregistrée.'));
  });
});
