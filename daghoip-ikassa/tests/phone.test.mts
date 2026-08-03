/**
 * Normalisation des numéros gabonais.
 *
 * Ce module a un jumeau en SQL (`public.to_e164_gabon`). Les deux doivent
 * accepter et refuser exactement les mêmes numéros : si le navigateur normalise
 * autrement que la base, un numéro passe la validation du formulaire puis se
 * fait rejeter par une contrainte — et l'utilisateur ne comprend pas pourquoi.
 * Les cas ci-dessous reprennent ceux de la suite SQL.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatGabonPhoneNational, isValidGabonPhone, normalizeGabonPhone } from '@/utils/phone';

describe('normalizeGabonPhone', () => {
  it('retire le zéro d’acheminement, absent de la notation E.164', () => {
    assert.equal(normalizeGabonPhone('06 12 34 56'), '+2416123456');
    assert.equal(normalizeGabonPhone('074123456'), '+24174123456');
  });

  it('accepte les formes internationales usuelles', () => {
    for (const input of ['+241 06 12 34 56', '00241 06 12 34 56', '241612 34 56']) {
      assert.equal(normalizeGabonPhone(input), '+2416123456', input);
    }
  });

  it('ignore la ponctuation de saisie', () => {
    for (const input of ['06.12.34.56', '06-12-34-56', '(06) 12 34 56', ' 0612 3456 ']) {
      assert.equal(normalizeGabonPhone(input), '+2416123456', input);
    }
  });

  it('accepte les longueurs de 7 à 9 chiffres significatifs', () => {
    assert.equal(normalizeGabonPhone('6123456'), '+2416123456');
    assert.equal(normalizeGabonPhone('612345678'), '+241612345678');
  });

  it('refuse ce qui n’est pas un numéro gabonais plausible', () => {
    for (const input of ['', '   ', '12345', '0', 'abcdefgh', '+33 6 12 34 56 78', '06123456789']) {
      assert.equal(normalizeGabonPhone(input), null, JSON.stringify(input));
    }
  });

  it('est idempotent sur une valeur déjà normalisée', () => {
    const once = normalizeGabonPhone('06 12 34 56');
    assert.equal(normalizeGabonPhone(once ?? ''), once);
  });
});

describe('isValidGabonPhone', () => {
  it('accepte ce que normalizeGabonPhone sait normaliser, et rien d’autre', () => {
    assert.equal(isValidGabonPhone('06 12 34 56'), true);
    assert.equal(isValidGabonPhone('12345'), false);
  });
});

describe('formatGabonPhoneNational', () => {
  it('réaffiche un E.164 dans la notation locale, celle qu’on dicte', () => {
    const national = formatGabonPhoneNational('+2416123456');
    assert.match(national, /^0/, 'le zéro d’acheminement revient à l’affichage');
    assert.equal(national.replace(/\D/g, ''), '06123456');
  });

  it('fait l’aller-retour sans perte', () => {
    assert.equal(normalizeGabonPhone(formatGabonPhoneNational('+2416123456')), '+2416123456');
  });
});
