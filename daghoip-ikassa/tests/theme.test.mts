/**
 * Préférence de thème.
 *
 * Le script d'initialisation s'exécute **avant le premier rendu**, hors de
 * React : il n'a droit à aucune erreur. Un navigateur qui refuse `localStorage`
 * (navigation privée verrouillée, certains WebViews) ne doit pas se retrouver
 * avec une page blanche parce qu'une exception a interrompu le `<head>`.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
} from '@/lib/theme';

/** Faux DOM minimal : on ne teste que la logique, pas le navigateur. */
function stubBrowser(options: { stored?: string | null; prefersDark?: boolean; throws?: boolean }) {
  const attributes = new Map<string, string>();

  (globalThis as Record<string, unknown>).document = {
    documentElement: {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
  };

  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => {
      if (options.throws) throw new Error('stockage refusé');
      return key === THEME_STORAGE_KEY ? (options.stored ?? null) : null;
    },
    setItem: () => {
      if (options.throws) throw new Error('stockage refusé');
    },
  };

  (globalThis as Record<string, unknown>).window = {
    matchMedia: () => ({ matches: options.prefersDark ?? false }),
  };

  return attributes;
}

afterEach(() => {
  for (const key of ['document', 'localStorage', 'window']) {
    delete (globalThis as Record<string, unknown>)[key];
  }
});

describe('resolveTheme', () => {
  it('respecte un choix explicite, quel que soit le réglage du téléphone', () => {
    stubBrowser({ prefersDark: true });
    assert.equal(resolveTheme('light'), 'light');
    assert.equal(resolveTheme('dark'), 'dark');
  });

  it('suit le téléphone quand la préférence est « système »', () => {
    stubBrowser({ prefersDark: true });
    assert.equal(resolveTheme('system'), 'dark');

    stubBrowser({ prefersDark: false });
    assert.equal(resolveTheme('system'), 'light');
  });
});

describe('readThemePreference', () => {
  it('retombe sur « système » par défaut', () => {
    stubBrowser({ stored: null });
    assert.equal(readThemePreference(), 'system');
  });

  it('ignore une valeur stockée invalide plutôt que de la propager', () => {
    stubBrowser({ stored: 'bleu-nuit' });
    assert.equal(readThemePreference(), 'system');
  });

  it('ne lève pas quand le stockage local est refusé', () => {
    stubBrowser({ throws: true });
    assert.equal(readThemePreference(), 'system');
  });
});

describe('applyTheme', () => {
  it('pose l’attribut lu par la feuille de styles', () => {
    const attributes = stubBrowser({ prefersDark: false });
    applyTheme('dark');
    assert.equal(attributes.get('data-theme'), 'dark');
  });

  it('applique le thème même si la préférence ne peut pas être mémorisée', () => {
    const attributes = stubBrowser({ throws: true, prefersDark: false });
    assert.doesNotThrow(() => applyTheme('dark'));
    assert.equal(attributes.get('data-theme'), 'dark');
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('est enveloppé dans un try/catch : il s’exécute avant tout rendu', () => {
    assert.match(THEME_INIT_SCRIPT, /try\s*\{/);
    assert.match(THEME_INIT_SCRIPT, /catch/);
  });

  it('retombe sur le thème clair en cas d’erreur', () => {
    assert.match(THEME_INIT_SCRIPT, /catch[^}]*'light'/s);
  });

  it('lit la même clé de stockage que le reste du module', () => {
    assert.ok(THEME_INIT_SCRIPT.includes(THEME_STORAGE_KEY));
  });

  it('ne contient pas de `</script>`, qui fermerait la balise qui le porte', () => {
    assert.ok(!THEME_INIT_SCRIPT.includes('</script>'));
  });
});
