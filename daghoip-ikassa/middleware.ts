import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/**
 * Middleware global : rafraîchit la session Supabase et protège les routes
 * privées avant même le rendu de la page.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes SAUF :
     *  - les fichiers statiques de Next.js (_next/static, _next/image)
     *  - le favicon et les fichiers d'images du dossier public
     *  - les routes de métadonnées (robots.txt, sitemap.xml, manifest)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico)$).*)',
  ],
};
