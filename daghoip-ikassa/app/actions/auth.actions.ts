'use server';

/**
 * Server Actions d'authentification.
 *
 * Règles :
 *  - toutes les entrées sont revalidées ici avec Zod (le formulaire client ne
 *    fait que de l'UX) ;
 *  - les messages d'erreur restent génériques pour ne pas révéler l'existence
 *    d'un compte (énumération d'e-mails) ;
 *  - un rate limit protège des tentatives répétées.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { getSiteUrl } from '@/lib/env';
import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import {
  resetPasswordRequestSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  updatePasswordSchema,
} from '@/utils/validation';

/** Identifiant de rate limit basé sur l'IP du client (best effort). */
async function getClientKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? 'unknown';
  return `${prefix}:${ip}`;
}

/** Empêche une redirection ouverte : seules les URLs internes sont acceptées. */
function safeRedirectPath(input: FormDataEntryValue | null): string {
  const value = typeof input === 'string' ? input : '';
  if (!value.startsWith('/') || value.startsWith('//')) return '/compte';
  return value;
}

export async function signUpAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('signup'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) {
    return { success: false, error: `Trop de tentatives. Réessayez dans ${rate.retryAfter}s.` };
  }

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
  if (!rate.success) {
    return { success: false, error: `Trop de tentatives. Réessayez dans ${rate.retryAfter}s.` };
  }

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
    // Message volontairement indifférencié (pas d'énumération de comptes).
    return { success: false, error: 'Adresse e-mail ou mot de passe incorrect.' };
  }

  revalidatePath('/', 'layout');
  redirect(safeRedirectPath(formData.get('next')));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function requestPasswordResetAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const rate = checkRateLimit(
    await getClientKey('reset'),
    RATE_LIMITS.auth.limit,
    RATE_LIMITS.auth.windowMs,
  );
  if (!rate.success) {
    return { success: false, error: `Trop de tentatives. Réessayez dans ${rate.retryAfter}s.` };
  }

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

  // Réponse identique dans tous les cas : on ne divulgue pas si le compte existe.
  return ok(null);
}

export async function updatePasswordAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = updatePasswordSchema.safeParse({
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

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn('Échec de changement de mot de passe', { code: error.code });
    return fail(error, 'Impossible de mettre à jour le mot de passe.');
  }

  revalidatePath('/compte');
  return ok(null);
}
