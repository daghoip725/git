/**
 * Nettoyage typographique des annonces.
 *
 * Ces règles s'appliquent au texte que le vendeur vient d'écrire : une
 * régression ici ne provoque pas d'erreur, elle abîme silencieusement son
 * travail. D'où l'insistance sur deux propriétés qu'on ne teste pas assez
 * souvent : l'**idempotence** (rejouer la mise en forme ne change plus rien) et
 * la **non-intervention** sur un texte déjà propre.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tidyDescription, tidyTitle } from '@/lib/ai/tidy';

describe('tidyTitle', () => {
  it('ramène un titre crié à une casse normale', () => {
    assert.equal(tidyTitle('TELEPHONE SAMSUNG NEUF').text, 'Telephone samsung neuf');
  });

  it('réduit la ponctuation répétée sans la faire disparaître', () => {
    // `\u00A0` : l'espace avant « ! » est **insécable**, comme le veut la
    // typographie française. Écrire une espace ordinaire dans l'attendu ferait
    // passer le test pour un échec alors que la règle est correctement appliquée.
    assert.equal(tidyTitle('Urgent !!!!').text, 'Urgent\u00A0!');
  });

  it('préserve les sigles courts, qui ne sont pas des cris', () => {
    for (const title of ['TV LED 4K', 'Vends 4x4 GPS', 'Groupe électrogène 5 kVA']) {
      assert.equal(tidyTitle(title).text, title, title);
    }
  });

  it('laisse intact un titre déjà correct', () => {
    const title = 'Canapé 3 places, bon état';
    const result = tidyTitle(title);
    assert.equal(result.text, title);
    assert.equal(result.changed, false);
  });

  it('replie les espaces multiples et les retours à la ligne', () => {
    assert.equal(tidyTitle('  Toyota   Corolla \n 2010  ').text, 'Toyota Corolla 2010');
  });
});

describe('tidyDescription', () => {
  it('applique l’espacement français sans coller la virgule', () => {
    assert.equal(tidyDescription('Bon état ,prix à débattre').text, 'Bon état, prix à débattre');

    // Le double-point, lui, prend une espace insécable **avant**.
    assert.equal(tidyDescription('Contenu:un chargeur').text, 'Contenu\u00A0: un chargeur');
  });

  it('sépare les milliers d’un montant écrit d’un bloc', () => {
    // Séparateur de milliers : espace fine insécable (U+202F), celle qu'emploie
    // aussi `Intl.NumberFormat` en français — les deux doivent coïncider, sinon
    // un prix saisi et un prix formaté ne se ressembleraient pas.
    assert.match(tidyDescription('Prix 100000 FCFA').text, /100\u202F000 FCFA/);
  });

  it('décrie phrase par phrase, sans toucher au reste', () => {
    const result = tidyDescription('VENDS TELEPHONE EN BON ETAT. prix à débattre').text;
    assert.match(result, /^Vends telephone en bon etat\./);
    assert.match(result, /prix à débattre$/);
  });

  it('réduit les lignes vides en trop à une seule séparation', () => {
    assert.equal(tidyDescription('Ligne un\n\n\n\n\nLigne deux').text, 'Ligne un\n\nLigne deux');
  });

  it('ne transforme pas « !!!! » en « ! ! ! ! »', () => {
    // Régression réelle : l'espacement français s'appliquait avant la réduction
    // des répétitions, et séparait les points d'exclamation avant de pouvoir
    // les reconnaître comme une répétition.
    assert.equal(tidyDescription('Occasion à saisir !!!!').text, 'Occasion à saisir\u00A0!');
  });

  it('est idempotent', () => {
    const messy = 'VENDS TELEPHONE!!!! prix 100000 f a debattre ,urgent .\n\n\n\nAppelez moi';
    const once = tidyDescription(messy).text;
    const twice = tidyDescription(once).text;
    assert.equal(twice, once);
  });

  it('laisse intact un texte déjà propre', () => {
    const clean = 'Bon état. Vendu avec le chargeur, prix 45 000 FCFA.';
    const result = tidyDescription(clean);
    assert.equal(result.text, clean);
    assert.equal(result.changed, false);
  });

  it('ne perd aucun mot du texte d’origine', () => {
    const source = 'Vends REFRIGERATEUR combiné, très bon état, livraison possible à Owendo';
    const before = source.toLocaleLowerCase('fr').match(/[\p{L}\p{N}]+/gu) ?? [];
    const after = tidyDescription(source).text.toLocaleLowerCase('fr').match(/[\p{L}\p{N}]+/gu) ?? [];
    assert.deepEqual(after, before);
  });
});
