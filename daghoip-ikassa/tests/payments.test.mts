/**
 * Vérification de signature des rappels d'opérateur.
 *
 * C'est la seule barrière entre un rappel authentique et un appel forgé : la
 * route `/api/paiements/[provider]/callback` est publique par construction.
 * Deux propriétés doivent tenir, et elles sont faciles à casser par
 * inadvertance : la comparaison est **à temps constant**, et elle porte sur le
 * **corps brut** — reparser puis re-sérialiser le JSON réordonne les clés et
 * invaliderait toute signature honnête.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeHmacSha256, signaturesMatch, timestampIsFresh } from '@/lib/payments/signature';

const SECRET = 'secret-partage-de-test-1234567890';
const BODY = '{"transaction":{"id":"DI-PAY-ABCD1234","status":"TS"}}';

describe('computeHmacSha256', () => {
  it('produit un condensé hexadécimal de 64 caractères', () => {
    assert.match(computeHmacSha256(BODY, SECRET), /^[0-9a-f]{64}$/);
  });

  it('change dès qu’un octet du corps change', () => {
    const a = computeHmacSha256(BODY, SECRET);
    const b = computeHmacSha256(BODY.replace('TS', 'TF'), SECRET);
    assert.notEqual(a, b);
  });

  it('change avec le secret', () => {
    assert.notEqual(computeHmacSha256(BODY, SECRET), computeHmacSha256(BODY, SECRET + 'x'));
  });

  it('distingue deux corps équivalents mais écrits différemment', () => {
    // C'est précisément pourquoi la signature porte sur les octets reçus :
    // ces deux corps représentent le même objet et n'ont pas la même signature.
    const reordered = '{"transaction":{"status":"TS","id":"DI-PAY-ABCD1234"}}';
    assert.notEqual(computeHmacSha256(BODY, SECRET), computeHmacSha256(reordered, SECRET));
  });
});

describe('signaturesMatch', () => {
  const expected = computeHmacSha256(BODY, SECRET);

  it('accepte la signature attendue', () => {
    assert.equal(signaturesMatch(expected, expected), true);
  });

  it('accepte les variantes de notation rencontrées chez les opérateurs', () => {
    assert.equal(signaturesMatch(`sha256=${expected}`, expected), true);
    assert.equal(signaturesMatch(expected.toUpperCase(), expected), true);
    assert.equal(signaturesMatch(`  ${expected}  `, expected), true);
  });

  it('refuse une signature absente, vide ou tronquée', () => {
    assert.equal(signaturesMatch(null, expected), false);
    assert.equal(signaturesMatch('', expected), false);
    assert.equal(signaturesMatch(expected.slice(0, 32), expected), false);
  });

  it('refuse une signature de même longueur mais fausse', () => {
    const wrong = computeHmacSha256(BODY, 'un-autre-secret-de-test-0987654321');
    assert.equal(wrong.length, expected.length);
    assert.equal(signaturesMatch(wrong, expected), false);
  });

  it('ne lève jamais, quelle que soit l’entrée', () => {
    for (const input of ['', '???', 'sha256=', 'sha256=zz', '0'.repeat(200)]) {
      assert.doesNotThrow(() => signaturesMatch(input, expected), JSON.stringify(input));
    }
  });
});

describe('timestampIsFresh', () => {
  it('accepte un horodatage récent, en secondes comme en millisecondes', () => {
    assert.equal(timestampIsFresh(Math.floor(Date.now() / 1000)), true);
    assert.equal(timestampIsFresh(Date.now()), true);
  });

  it('refuse un horodatage trop ancien : un rappel intercepté ne doit pas être rejouable', () => {
    assert.equal(timestampIsFresh(Math.floor(Date.now() / 1000) - 3600), false);
  });

  it('refuse un horodatage trop lointain dans le futur', () => {
    assert.equal(timestampIsFresh(Math.floor(Date.now() / 1000) + 3600), false);
  });

  it('refuse une valeur absente ou illisible', () => {
    for (const input of [null, '', 'hier', '0', '-1', 'NaN']) {
      assert.equal(timestampIsFresh(input), false, JSON.stringify(input));
    }
  });

  it('respecte la tolérance demandée', () => {
    const almost = Math.floor(Date.now() / 1000) - 240;
    assert.equal(timestampIsFresh(almost, 300), true);
    assert.equal(timestampIsFresh(almost, 60), false);
  });
});
