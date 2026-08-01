/**
 * Point de retour du flux d'authentification Supabase.
 *
 * Couvre la confirmation d'e-mail, le lien de réinitialisation, le lien magique
 * et le retour des fournisseurs externes (Google, Facebook). Le code à usage
 * unique est échangé contre une session, puis les cookies sont posés sur la
 * réponse de redirection.
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

  // Le fournisseur externe signale un refus via `error` / `error_description`.
  const providerError = searchParams.get('error');
  if (providerError) {
    logger.warn('Fournisseur externe : autorisation refusée', { error: providerError });
    const reason = providerError === 'access_denied' ? 'acces_refuse' : 'lien_invalide';
    return NextResponse.redirect(`${origin}/connexion?erreur=${reason}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/connexion?erreur=lien_invalide`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn('Échec de l’échange du code d’authentification', { code: error.code });
    return NextResponse.redirect(`${origin}/connexion?erreur=lien_expire`);
  }

  // Un compte suspendu ou banni ne doit pas obtenir de session utilisable.
  // La RLS l'empêche déjà d'écrire quoi que ce soit, mais autant le lui dire
  // franchement plutôt que de le laisser buter sur des refus silencieux.
  if (data.user) {
    const { data: profile } = await supabase
      .from('users')
      .select('status')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profile && profile.status !== 'active') {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/connexion?erreur=compte_suspendu`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
