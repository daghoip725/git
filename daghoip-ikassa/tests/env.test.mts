/**
 * Contrôle de configuration avant déploiement.
 *
 * Ce script est un garde-fou : il ne sert que le jour où quelqu'un se trompe de
 * variable. Un garde-fou qu'on ne teste pas finit par ne plus rien garder — il
 * suffit d'un refactoring qui inverse une condition pour qu'il passe tout au
 * vert sans que personne ne s'en aperçoive.
 *
 * Les cas ci-dessous sont donc ceux qui comptent vraiment, et notamment le
 * plus coûteux : la clé `service_role` collée à la place de la clé anonyme.
 *
 * Le script est exécuté **en sous-processus** plutôt qu'importé : c'est ainsi
 * qu'il tourne en vrai, et son code de sortie fait partie de ce qu'on vérifie —
 * c'est lui qui décide si un déploiement s'arrête.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

const SCRIPT = new URL('../scripts/verifier-env.mjs', import.meta.url).pathname;

/** Fabrique un JWT dont seule la charge utile compte : le script la décode. */
function jeton(role: string): string {
  const entete = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const charge = Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url');
  return `${entete}.${charge}.signature-factice`;
}

const ANON = jeton('anon');
const SERVICE_ROLE = jeton('service_role');

/** Configuration minimale et saine, que chaque cas vient dégrader. */
const SAINE: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://exemple.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  NEXT_PUBLIC_SITE_URL: 'https://daghoip-ikassa.ga',
};

interface Resultat {
  code: number;
  sortie: string;
}

function verifier(env: Record<string, string>, prod = true): Resultat {
  const args = prod ? ['--prod'] : [];
  try {
    const sortie = execFileSync(process.execPath, [SCRIPT, ...args], {
      // `env` remplace entièrement l'environnement : sans cela, une variable
      // présente sur la machine de développement fausserait le test.
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
    });
    return { code: 0, sortie };
  } catch (error) {
    const erreur = error as { status?: number; stdout?: string };
    return { code: erreur.status ?? 1, sortie: erreur.stdout ?? '' };
  }
}

describe('verifier-env', () => {
  it('accepte une configuration saine', () => {
    const { code, sortie } = verifier(SAINE);
    assert.equal(code, 0);
    assert.ok(sortie.includes('Tout est en place') || !sortie.includes('ERREUR'), sortie);
  });

  it('REFUSE une clé service_role à la place de la clé anonyme', () => {
    // Le cas le plus coûteux : cette clé contourne toutes les politiques RLS,
    // et elle serait inlinée dans le bundle envoyé au navigateur.
    const { code, sortie } = verifier({ ...SAINE, NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_ROLE });
    assert.equal(code, 1);
    assert.match(sortie, /service_role/);
  });

  it('accepte une vraie clé anonyme sans la confondre', () => {
    const { code } = verifier(SAINE);
    assert.equal(code, 0);
  });

  it('REFUSE une URL de site locale en production', () => {
    const { code, sortie } = verifier({ ...SAINE, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
    assert.equal(code, 1);
    assert.match(sortie, /machine locale|HTTPS/);
  });

  it('tolère la même URL locale hors production', () => {
    const { code } = verifier({ ...SAINE, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }, false);
    assert.equal(code, 0);
  });

  it('REFUSE une URL de site terminée par une barre oblique', () => {
    const { code, sortie } = verifier({
      ...SAINE,
      NEXT_PUBLIC_SITE_URL: 'https://daghoip-ikassa.ga/',
    });
    assert.equal(code, 1);
    assert.match(sortie, /double slash/);
  });

  it('REFUSE un opérateur Mobile Money configuré à moitié', () => {
    // Pire qu'absent : l'opérateur n'apparaît pas au paiement, et l'on cherche
    // du côté de l'interface plutôt que de la variable oubliée.
    const { code, sortie } = verifier({
      ...SAINE,
      AIRTEL_MONEY_BASE_URL: 'https://api.airtel.example',
      AIRTEL_MONEY_CLIENT_ID: 'identifiant',
      AIRTEL_MONEY_CLIENT_SECRET: 'secret',
    });
    assert.equal(code, 1);
    assert.match(sortie, /AIRTEL_MONEY_CALLBACK_SECRET/);
  });

  it('accepte un opérateur entièrement configuré', () => {
    const { code } = verifier({
      ...SAINE,
      AIRTEL_MONEY_BASE_URL: 'https://api.airtel.example',
      AIRTEL_MONEY_CLIENT_ID: 'identifiant',
      AIRTEL_MONEY_CLIENT_SECRET: 'secret',
      AIRTEL_MONEY_CALLBACK_SECRET: 'secret-de-rappel-suffisamment-long',
    });
    assert.equal(code, 0);
  });

  it('REFUSE un envoi d’e-mails sans secret protégeant la file', () => {
    const { code, sortie } = verifier({
      ...SAINE,
      RESEND_API_KEY: 're_0123456789',
      EMAIL_FROM: 'Daghoip Ikassa <notifications@daghoip-ikassa.ga>',
    });
    assert.equal(code, 1);
    assert.match(sortie, /NOTIFICATIONS_CRON_SECRET/);
  });

  it('REFUSE un expéditeur mal formé', () => {
    const { code, sortie } = verifier({
      ...SAINE,
      RESEND_API_KEY: 're_0123456789',
      EMAIL_FROM: 'notifications-at-daghoip',
      NOTIFICATIONS_CRON_SECRET: 'un-secret-de-plus-de-vingt-quatre-caracteres',
    });
    assert.equal(code, 1);
    assert.match(sortie, /EMAIL_FROM/);
  });

  it('ne fait qu’avertir pour une fonctionnalité facultative absente', () => {
    // Une clé d'IA absente n'est pas une panne : le dépôt d'annonce fonctionne
    // sans elle. Traiter cela comme une erreur apprendrait à ignorer la sortie.
    const { code, sortie } = verifier(SAINE);
    assert.equal(code, 0);
    assert.match(sortie, /AVERTISSEMENT {2}ANTHROPIC_API_KEY/);
  });
});
