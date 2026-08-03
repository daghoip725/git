#!/usr/bin/env node
/**
 * Vérification de la configuration avant déploiement.
 *
 *     npm run verify:env               # contrôles de développement
 *     npm run verify:env -- --prod     # contrôles de production, plus stricts
 *
 * `lib/env.ts` valide déjà la **forme** des variables au démarrage, et fait
 * échouer le build si une clé publique manque. Ce script répond à une autre
 * question : la configuration est-elle *prête pour la production* ?
 *
 * La différence n'est pas théorique. Une application démarre parfaitement avec
 * `NEXT_PUBLIC_SITE_URL=http://localhost:3000` en production : rien n'est
 * invalide. Simplement, les liens des courriels de confirmation pointent vers
 * la machine de l'utilisateur, les redirections d'authentification échouent, et
 * le sitemap déclare des URL qui n'existent pas. Personne ne s'en aperçoit
 * avant la première inscription réelle.
 *
 * Ce script signale donc deux choses distinctes :
 *
 *   ERREUR         empêche le service de fonctionner correctement (code 1) ;
 *   AVERTISSEMENT  fonctionnalité absente, mais choix légitime (code 0).
 *
 * Cette distinction est le cœur du script : une clé Mobile Money absente n'est
 * pas une panne — on encaisse alors par virement — et la traiter comme telle
 * aurait fini par apprendre à tout le monde à ignorer la sortie.
 */

const prod = process.argv.includes('--prod');

/** @type {string[]} */
const erreurs = [];
/** @type {string[]} */
const avertissements = [];

const lire = (nom) => {
  const valeur = process.env[nom];
  return valeur && valeur.trim() !== '' ? valeur.trim() : undefined;
};

/* -------------------------------------------------------------------------- */
/*  Indispensable                                                             */
/* -------------------------------------------------------------------------- */

const supabaseUrl = lire('NEXT_PUBLIC_SUPABASE_URL');
if (!supabaseUrl) {
  erreurs.push('NEXT_PUBLIC_SUPABASE_URL est absente.');
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(supabaseUrl)) {
  // Volontairement un avertissement : une instance Supabase auto-hébergée a une
  // autre forme d'URL, et la refuser serait faux.
  avertissements.push(
    `NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}) ne ressemble pas à une URL Supabase hébergée. ` +
      'Normal pour une instance auto-hébergée.',
  );
}

const anonKey = lire('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!anonKey) {
  erreurs.push('NEXT_PUBLIC_SUPABASE_ANON_KEY est absente.');
}

/*
 * La confusion la plus coûteuse du projet, et elle est facile à faire : les
 * deux clés se ressemblent, se copient depuis le même écran, et l'application
 * démarre parfaitement avec la mauvaise. Sauf que `service_role` contourne
 * **toutes** les politiques RLS — inlinée dans le bundle client, elle ouvre la
 * base entière à n'importe quel visiteur qui lit le code source de la page.
 */
if (anonKey && serviceRoleProbable(anonKey)) {
  erreurs.push(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY contient une clé « service_role ». ' +
      'Cette clé contourne la RLS et serait exposée au navigateur : ' +
      'reprenez la clé « anon / public » dans Project Settings → API.',
  );
}

/* -------------------------------------------------------------------------- */
/*  URL du site                                                               */
/* -------------------------------------------------------------------------- */

const siteUrl = lire('NEXT_PUBLIC_SITE_URL');
if (!siteUrl) {
  (prod ? erreurs : avertissements).push(
    'NEXT_PUBLIC_SITE_URL est absente : les liens des courriels et le sitemap ' +
      'retomberont sur http://localhost:3000.',
  );
} else {
  if (prod && !siteUrl.startsWith('https://')) {
    erreurs.push(`NEXT_PUBLIC_SITE_URL (${siteUrl}) doit être en HTTPS en production.`);
  }
  if (prod && /localhost|127\.0\.0\.1/.test(siteUrl)) {
    erreurs.push(
      `NEXT_PUBLIC_SITE_URL (${siteUrl}) pointe vers la machine locale. ` +
        'Les liens de confirmation envoyés par courriel seraient inutilisables.',
    );
  }
  if (siteUrl.endsWith('/')) {
    erreurs.push(
      `NEXT_PUBLIC_SITE_URL (${siteUrl}) se termine par « / ». ` +
        'Les URL construites porteraient un double slash.',
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Encaissement                                                              */
/* -------------------------------------------------------------------------- */

if (!lire('SUPABASE_SERVICE_ROLE_KEY')) {
  avertissements.push(
    'SUPABASE_SERVICE_ROLE_KEY absente : les rappels des opérateurs Mobile Money ' +
      'ne peuvent pas être appliqués. Les règlements devront être confirmés à la main.',
  );
}

for (const operateur of ['AIRTEL_MONEY', 'MOOV_MONEY']) {
  const champs = ['BASE_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'CALLBACK_SECRET'];
  const presents = champs.filter((champ) => lire(`${operateur}_${champ}`));

  if (presents.length === 0) continue;

  /*
   * Une configuration **partielle** est pire qu'absente : l'opérateur
   * n'apparaît pas dans la liste des moyens de paiement, alors que la personne
   * qui a renseigné trois variables sur quatre croit l'avoir activé. Elle
   * cherche alors du côté de l'interface, jamais du côté de la variable
   * oubliée.
   */
  if (presents.length < champs.length) {
    const absents = champs.filter((champ) => !lire(`${operateur}_${champ}`));
    erreurs.push(
      `${operateur} est configuré à moitié (${absents.map((c) => `${operateur}_${c}`).join(', ')} ` +
        'manquante(s)). L’opérateur ne sera PAS proposé au paiement.',
    );
    continue;
  }

  const secret = lire(`${operateur}_CALLBACK_SECRET`);
  if (secret && secret.length < 16) {
    erreurs.push(`${operateur}_CALLBACK_SECRET fait moins de 16 caractères.`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Notifications par courriel                                                */
/* -------------------------------------------------------------------------- */

const resend = lire('RESEND_API_KEY');
const emailFrom = lire('EMAIL_FROM');

if (!resend) {
  avertissements.push(
    'RESEND_API_KEY absente : les notifications restent dans l’application. ' +
      'Aucune copie par courriel ne partira.',
  );
} else if (!emailFrom) {
  erreurs.push('RESEND_API_KEY est renseignée mais EMAIL_FROM manque : aucun envoi ne partira.');
} else if (!/<[^@\s]+@[^@\s]+\.[^@\s]+>/.test(emailFrom)) {
  erreurs.push(
    `EMAIL_FROM (${emailFrom}) doit être de la forme « Daghoip Ikassa <notifications@domaine.ga> ».`,
  );
}

const cronSecret = lire('NOTIFICATIONS_CRON_SECRET');
if (resend && !cronSecret) {
  erreurs.push(
    'NOTIFICATIONS_CRON_SECRET absente alors que l’envoi est activé : ' +
      '/api/notifications/envoi serait ouverte à tous. Générez-la : openssl rand -base64 32',
  );
} else if (cronSecret && cronSecret.length < 24) {
  erreurs.push('NOTIFICATIONS_CRON_SECRET fait moins de 24 caractères.');
}

/* -------------------------------------------------------------------------- */
/*  Assistant de rédaction                                                    */
/* -------------------------------------------------------------------------- */

if (!lire('ANTHROPIC_API_KEY')) {
  avertissements.push(
    'ANTHROPIC_API_KEY absente : « Rédiger pour moi » et la correction ' +
      'orthographique ne seront pas proposées. Le reste du dépôt d’annonce fonctionne.',
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortie                                                                    */
/* -------------------------------------------------------------------------- */

const titre = prod ? 'Configuration — contrôles de PRODUCTION' : 'Configuration — développement';
console.log(`\n${titre}\n${'='.repeat(titre.length)}\n`);

for (const message of avertissements) console.log(`  AVERTISSEMENT  ${message}`);
if (avertissements.length && erreurs.length) console.log('');
for (const message of erreurs) console.log(`  ERREUR         ${message}`);

if (!erreurs.length && !avertissements.length) {
  console.log('  Tout est en place.\n');
} else {
  console.log(
    `\n  ${erreurs.length} erreur(s), ${avertissements.length} avertissement(s).` +
      (erreurs.length ? '' : ' Rien de bloquant.') +
      '\n',
  );
}

process.exit(erreurs.length ? 1 : 0);

/**
 * Reconnaît une clé `service_role` glissée là où on attend la clé anonyme.
 *
 * Les jetons Supabase sont des JWT : la charge utile du milieu, en base64url,
 * porte `"role":"service_role"`. On la décode plutôt que de chercher la chaîne
 * dans le jeton entier — elle n'y apparaît pas en clair.
 */
function serviceRoleProbable(jeton) {
  const parties = jeton.split('.');
  if (parties.length !== 3) return false;

  try {
    const charge = JSON.parse(Buffer.from(parties[1], 'base64url').toString('utf8'));
    return charge?.role === 'service_role';
  } catch {
    // Jeton illisible : ce n'est pas à ce script de décider qu'il est invalide,
    // `lib/env.ts` et Supabase s'en chargeront avec de meilleurs messages.
    return false;
  }
}
