/**
 * Slugs et références d'annonces.
 *
 * L'URL d'une annonce est `/annonces/<slug>-<reference>`. Deux propriétés
 * comptent : le slug doit être stable et sans surprise (il finit dans les liens
 * partagés sur WhatsApp), et la référence doit toujours pouvoir être
 * ré-extraite — c'est elle, et non le slug, qui identifie l'annonce en base.
 * Un slug modifié après une correction de titre ne doit donc jamais casser un
 * lien déjà partagé.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildListingHref, extractReference, slugify } from '@/utils/slug';

describe('slugify', () => {
  it('translittère les accents plutôt que de les supprimer', () => {
    assert.equal(slugify('Réfrigérateur à vendre'), 'refrigerateur-a-vendre');
    assert.equal(slugify('Groupe électrogène'), 'groupe-electrogene');
  });

  it('réduit toute ponctuation à un seul tiret', () => {
    assert.equal(slugify('Toyota RAV4 2018 — état neuf !!!'), 'toyota-rav4-2018-etat-neuf');
  });

  it('ne laisse jamais de tiret en tête ni en queue', () => {
    for (const input of ['  ---Voiture---  ', '!!! Voiture !!!', '…Voiture…']) {
      const slug = slugify(input);
      assert.ok(!slug.startsWith('-') && !slug.endsWith('-'), `${input} → ${slug}`);
    }
  });

  it('respecte la longueur maximale demandée', () => {
    const slug = slugify('a'.repeat(200), 30);
    assert.ok(slug.length <= 30, `longueur ${slug.length}`);
  });

  it('ne produit que des caractères sûrs en URL', () => {
    const slug = slugify('Vends 4x4 Prado — 12 000 000 FCFA, état impeccable (négociable)');
    assert.match(slug, /^[a-z0-9-]+$/);
  });

  it('est idempotent', () => {
    const once = slugify('Réfrigérateur à vendre');
    assert.equal(slugify(once), once);
  });
});

describe('extractReference', () => {
  it('retrouve la référence à la fin du chemin', () => {
    const href = buildListingHref('toyota-corolla-2010', 'AB12CD34');
    const slug = href.split('/').pop() ?? '';
    assert.equal(extractReference(slug), 'AB12CD34');
  });

  it('résiste à un slug contenant des chiffres et des tirets', () => {
    assert.equal(extractReference('toyota-4x4-2018-XYZ12345'), 'XYZ12345');
  });

  it('retourne null quand il n’y a pas de référence exploitable', () => {
    for (const input of ['', 'sans-reference', '---']) {
      assert.equal(extractReference(input), null, JSON.stringify(input));
    }
  });
});

describe('buildListingHref', () => {
  it('produit un chemin absolu sous /annonces', () => {
    assert.match(buildListingHref('canape-3-places', 'AB12CD34'), /^\/annonces\//);
  });

  it('fait l’aller-retour slug → URL → référence', () => {
    const reference = 'QWERTY12';
    const href = buildListingHref(slugify('Canapé 3 places'), reference);
    assert.equal(extractReference(href.split('/').pop() ?? ''), reference);
  });
});
