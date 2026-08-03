'use server';

/**
 * Server Actions d'authentification.
 *
 * Quatre chemins d'entrée : e-mail + mot de passe, Google, Facebook, et code
 * SMS (OTP). Tous aboutissent à une session Supabase, et le trigger
 * `handle_new_user` crée le profil `public.users` correspondant, quel que soit
 * le fournisseur.
 *
 * Règles communes :
 *  - toutes les entrées sont revalidées ici avec Zod (le formulaire client ne
 *    fait que de l'UX) ;
 *  - les messages restent indifférenciés pour ne pas permettre d'énumérer les
 *    comptes existants ;
 *  - un rate limit par IP freine les tentatives répétées ;
 *  - les redirections `next` sont validées comme chemins internes.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { getSiteUrl, publicEnv } from '@/lib/env';
import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import {
  gabonPhoneSchema,
  resetPasswordRequestSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  updatePasswordSchema,
} from '@/utils/validation';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Identifiant de rate limit basé sur l'IP du client (best effort). */
async function getClientKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? 'unknown';
  return `${prefix}:${ip}`;
}

/**
 * Empêche une redirection ouverte : seules les URLs internes sont acceptées.
 * `//evil.com` est un chemin protocol-relative — il doit être rejeté.
 */
export async function safeRedirectPath(input: unknown, fallback = '/compte'): Promise<string> {
  const value = typeof input === 'string' ? input : '';
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

function rateLimited(retryAfter: number): ActionResult<never> {
  return {
    success: false,
    error: `Trop de tentatives. Réessayez dans ${
      retryAfter > 60 ? `${Math.ceil(retryAfter / 60)} min` : `${retryAfter}s`
    }.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  E-mail + mot de passe                                                     */
/* -------------------------------------------------------------------------- */

export async function signUpAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('signup'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    phone: formData.get('phone') ?? '',
    city: formData.get('city') ?? '',
    acceptTerms: formData.get('acceptTerms') === 'on',
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les champs signalés.',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      // Repris par le trigger `handle_new_user` pour créer le profil.
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
        city: parsed.data.city || null,
      },
    },
  });

  if (error) {
    logger.warn('Échec d’inscription', { code: error.code });
    return fail(error, 'Inscription impossible pour le moment. Veuillez réessayer.');
  }

  return ok(null);
}

export async function signInAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('signin'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les champs signalés.',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    logger.warn('Échec de connexion', { code: error.code });
    // Message volontairement indifférencié : pas d'énumération de comptes.
    return { success: false, error: 'Adresse e-mail ou mot de passe incorrect.' };
  }

  revalidatePath('/', 'layout');
  redirect(await safeRedirectPath(formData.get('next')));
}

/** Renvoie l'e-mail de confirmation d'inscription. */
export async function resendConfirmationAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('resend'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) return { success: false, error: 'Adresse e-mail invalide.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` },
  });

  if (error) logger.warn('Renvoi de confirmation impossible', { code: error.code });

  // Réponse identique dans tous les cas.
  return ok(null);
}

/* -------------------------------------------------------------------------- */
/*  Déconnexion                                                               */
/* -------------------------------------------------------------------------- */

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  // `global` révoque la session sur tous les appareils : c'est ce qu'attend un
  // utilisateur qui se déconnecte depuis un téléphone partagé ou un cybercafé.
  await supabase.auth.signOut({ scope: 'global' });

  revalidatePath('/', 'layout');
  redirect('/');
}

/* -------------------------------------------------------------------------- */
/*  Mot de passe                                                              */
/* -------------------------------------------------------------------------- */

export async function requestPasswordResetAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('reset'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = resetPasswordRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return {
      success: false,
      error: 'Adresse e-mail invalide.',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/compte/mot-de-passe`,
  });

  if (error) logger.warn('Échec de demande de réinitialisation', { code: error.code });

  // Réponse identique que le compte existe ou non.
  return ok(null);
}

/**
 * Change le mot de passe du compte connecté.
 *
 * Le mot de passe **actuel** est exigé. Sans lui, une session égarée — un
 * téléphone prêté, un poste partagé resté ouvert, un cookie dérobé — suffisait
 * à changer le mot de passe et donc à verrouiller définitivement la personne
 * hors de son propre compte. C'est le scénario le plus courant, et de loin le
 * plus coûteux pour la victime.
 *
 * Deux cas s'en dispensent, et ils sont légitimes :
 *
 *  1. **Retour du lien « mot de passe oublié »** — la personne ne connaît
 *     précisément pas son mot de passe. L'authentification a déjà eu lieu :
 *     elle a prouvé qu'elle relève les courriels du compte. Le marqueur est
 *     posé par `/auth/callback` après un échange de code réussi, il n'est donc
 *     pas falsifiable sans détenir déjà le lien reçu par courriel.
 *  2. **Compte sans mot de passe** — inscription par Google, Facebook ou SMS.
 *     Il n'y a pas d'ancien mot de passe à fournir ; exiger l'impossible
 *     empêcherait simplement d'en définir un.
 */
export async function updatePasswordAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = updatePasswordSchema.safeParse({
    // `?? undefined` : un champ absent du formulaire vaut `null` côté FormData,
    // que Zod refuserait sur un `.optional()`. Le cas se présente vraiment —
    // le formulaire de récupération n'affiche pas ce champ.
    currentPassword: formData.get('currentPassword') ?? undefined,
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les champs signalés.',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Votre session a expiré. Relancez la procédure.' };
  }

  /*
   * Limite par compte et non par IP : ici l'attaquant tient déjà la session,
   * son adresse n'a plus rien de distinctif. Ce qu'on freine, c'est le
   * devinage du mot de passe actuel à travers ce formulaire.
   */
  const rate = checkRateLimit(
    `updatePassword:${user.id}`,
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) {
    return { success: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
  }

  const fromRecovery = await consumeRecoveryGrant();

  // Un compte créé par Google, Facebook ou SMS n'a aucune identité « email » :
  // il n'a donc pas de mot de passe à confirmer, il s'en définit un premier.
  const { data: identities } = await supabase.auth.getUserIdentities();
  const hasPassword = (identities?.identities ?? []).some(
    (identity) => identity.provider === 'email',
  );

  if (hasPassword && !fromRecovery) {
    if (!parsed.data.currentPassword) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: { currentPassword: ['Saisissez votre mot de passe actuel.'] },
      };
    }

    const valid = await verifyCurrentPassword(user.email, parsed.data.currentPassword);
    if (!valid) {
      logger.warn('Mot de passe actuel incorrect', { userId: user.id });
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: { currentPassword: ['Ce mot de passe ne correspond pas au compte.'] },
      };
    }

    if (parsed.data.currentPassword === parsed.data.password) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: { password: ['Choisissez un mot de passe différent de l’actuel.'] },
      };
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn('Échec de changement de mot de passe', { code: error.code });
    return fail(error, 'Impossible de mettre à jour le mot de passe.');
  }

  /*
   * Les autres sessions tombent. C'est le geste attendu après un changement de
   * mot de passe : si l'on en change parce qu'on se croit compromis, laisser
   * l'intrus connecté ailleurs viderait l'opération de son sens. La session
   * courante, elle, est conservée — se déconnecter soi-même serait une punition
   * gratuite.
   */
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
  if (signOutError) {
    logger.warn('Révocation des autres sessions impossible', { code: signOutError.code });
  }

  revalidatePath('/compte');
  return ok(null);
}

/**
 * Vérifie le mot de passe actuel sans toucher à la session en cours.
 *
 * Le contrôle passe par un client **jetable** : `signInWithPassword` sur le
 * client habituel écraserait les cookies de session, et un échec laisserait la
 * personne déconnectée pour avoir mal tapé son ancien mot de passe. Ce
 * client-ci ne persiste rien et ne voit aucun cookie.
 */
async function verifyCurrentPassword(
  email: string | undefined,
  password: string,
): Promise<boolean> {
  if (!email) return false;

  const probe = createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;

  // La session obtenue n'a servi qu'à prouver le mot de passe ; on la rend.
  await probe.auth.signOut();
  return true;
}

/**
 * Consomme le marqueur de récupération posé par `/auth/callback`.
 *
 * À usage unique et à durée de vie courte : il autorise **un** changement de
 * mot de passe sans l'ancien, celui qui suit immédiatement le clic sur le lien
 * reçu par courriel. Une fois lu, il est effacé — sans quoi la dispense
 * resterait acquise pour toute la durée de la session.
 */
async function consumeRecoveryGrant(): Promise<boolean> {
  const store = await cookies();
  const present = store.get(RECOVERY_COOKIE)?.value === '1';
  if (present) store.delete(RECOVERY_COOKIE);
  return present;
}

/* -------------------------------------------------------------------------- */
/*  Fournisseurs externes (Google, Facebook)                                  */
/* -------------------------------------------------------------------------- */

const oauthProviderSchema = z.enum(['google', 'facebook']);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

/**
 * Démarre un flux OAuth et renvoie l'URL d'autorisation du fournisseur.
 *
 * Le flux PKCE est initié côté serveur : Supabase pose le cookie de vérifieur
 * sur la réponse, et `/auth/callback` échange ensuite le code contre une
 * session. Le paramètre `next` transite par la query string du callback, où il
 * est de nouveau validé comme chemin interne.
 */
export async function signInWithProviderAction(
  provider: string,
  next?: string,
): Promise<ActionResult<{ url: string }>> {
  const rate = checkRateLimit(
    await getClientKey('oauth'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = oauthProviderSchema.safeParse(provider);
  if (!parsed.success) return { success: false, error: 'Fournisseur non pris en charge.' };

  const safeNext = await safeRedirectPath(next);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data,
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      // `select_account` évite de reconnecter silencieusement le mauvais compte
      // sur un téléphone partagé — usage courant au Gabon.
      queryParams: parsed.data === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });

  if (error || !data?.url) {
    logger.error('Démarrage OAuth impossible', error, { provider: parsed.data });
    return {
      success: false,
      error: 'La connexion avec ce fournisseur est momentanément indisponible. Essayez par e-mail.',
    };
  }

  return ok({ url: data.url });
}

/* -------------------------------------------------------------------------- */
/*  Téléphone (OTP SMS)                                                       */
/* -------------------------------------------------------------------------- */

const phoneOnlySchema = z.object({ phone: gabonPhoneSchema });

const otpSchema = z.object({
  phone: gabonPhoneSchema,
  token: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'Le code reçu par SMS comporte 6 chiffres.'),
});

/**
 * Envoie un code de connexion par SMS.
 *
 * `shouldCreateUser: true` : au Gabon le téléphone est le premier identifiant,
 * on ne distingue donc pas inscription et connexion — un premier envoi crée le
 * compte, les suivants connectent.
 *
 * Prérequis : un fournisseur SMS configuré côté Supabase (Twilio, Vonage,
 * MessageBird…). Sans cela l'appel échoue et l'utilisateur est renvoyé vers la
 * connexion par e-mail.
 */
export async function sendPhoneOtpAction(
  _prevState: ActionResult<{ phone: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  const rate = checkRateLimit(
    await getClientKey('otp-send'),
    RATE_LIMITS.otpSend.limit,
    RATE_LIMITS.otpSend.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = phoneOnlySchema.safeParse({ phone: formData.get('phone') });
  if (!parsed.success) {
    return {
      success: false,
      error: 'Numéro invalide.',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  if (!parsed.data.phone) {
    return { success: false, error: 'Veuillez saisir votre numéro de téléphone.' };
  }

  // Rate limit supplémentaire par numéro : empêche de « bombarder » un tiers
  // de SMS depuis plusieurs adresses IP.
  const perPhone = checkRateLimit(
    `otp-phone:${parsed.data.phone}`,
    RATE_LIMITS.otpPerPhone.limit,
    RATE_LIMITS.otpPerPhone.windowMs,
  );
  if (!perPhone.success) return rateLimited(perPhone.retryAfter);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: parsed.data.phone,
    options: { shouldCreateUser: true },
  });

  if (error) {
    logger.warn('Envoi d’OTP impossible', { code: error.code });
    return {
      success: false,
      error:
        'Impossible d’envoyer le code par SMS pour le moment. Vous pouvez vous connecter par e-mail.',
    };
  }

  return ok({ phone: parsed.data.phone });
}

/** Vérifie le code reçu par SMS et ouvre la session. */
export async function verifyPhoneOtpAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('otp-verify'),
    RATE_LIMITS.otpVerify.limit,
    RATE_LIMITS.otpVerify.windowMs,
  );
  if (!rate.success) return rateLimited(rate.retryAfter);

  const parsed = otpSchema.safeParse({
    phone: formData.get('phone'),
    token: formData.get('token'),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'Code invalide.',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  if (!parsed.data.phone) return { success: false, error: 'Numéro manquant.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.token,
    type: 'sms',
  });

  if (error) {
    logger.warn('Vérification d’OTP échouée', { code: error.code });
    return { success: false, error: 'Code incorrect ou expiré. Demandez-en un nouveau.' };
  }

  revalidatePath('/', 'layout');
  redirect(await safeRedirectPath(formData.get('next')));
}

/**
 * Rattache un numéro vérifié à un compte existant (connecté par e-mail).
 * Le trigger `handle_user_updated` recopie le numéro dans `public.users` une
 * fois la confirmation faite.
 */
export async function linkPhoneAction(
  _prevState: ActionResult<{ phone: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Vous devez être connecté.' };

  const parsed = phoneOnlySchema.safeParse({ phone: formData.get('phone') });
  if (!parsed.success || !parsed.data.phone) {
    return { success: false, error: 'Numéro gabonais invalide.' };
  }

  const perPhone = checkRateLimit(
    `otp-phone:${parsed.data.phone}`,
    RATE_LIMITS.otpPerPhone.limit,
    RATE_LIMITS.otpPerPhone.windowMs,
  );
  if (!perPhone.success) return rateLimited(perPhone.retryAfter);

  const { error } = await supabase.auth.updateUser({ phone: parsed.data.phone });
  if (error) {
    logger.warn('Rattachement de numéro impossible', { code: error.code });
    return fail(error, 'Impossible d’envoyer le code de vérification.');
  }

  return ok({ phone: parsed.data.phone });
}

/** Confirme le rattachement d'un numéro à un compte existant. */
export async function verifyPhoneChangeAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = otpSchema.safeParse({
    phone: formData.get('phone'),
    token: formData.get('token'),
  });
  if (!parsed.success || !parsed.data.phone) {
    return { success: false, error: 'Code invalide.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.token,
    type: 'phone_change',
  });

  if (error) {
    logger.warn('Confirmation de numéro échouée', { code: error.code });
    return { success: false, error: 'Code incorrect ou expiré.' };
  }

  revalidatePath('/compte/profil');
  return ok(null);
}
