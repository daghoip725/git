/**
 * Point de retour du flux d'authentification Supabase (confirmation d'e-mail,
 * lien magique, réinitialisation de mot de passe).
 *
 * Le code à usage unique reçu en query string est échangé contre une session,
 * puis les cookies sont posés sur la réponse de redirection.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

/** Empêche toute redirection ouverte vers un domaine externe. */
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/compte';
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${origin}/connexion?erreur=lien_invalide`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn('Échec de l’échange du code d’authentification', { code: error.code });
    return NextResponse.redirect(`${origin}/connexion?erreur=lien_expire`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
