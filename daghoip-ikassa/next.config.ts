import type { NextConfig } from 'next';

/**
 * Hôte Supabase autorisé pour l'optimisation d'images.
 * On extrait le hostname depuis l'URL publique afin d'éviter un `remotePatterns`
 * trop permissif (`**`) qui exposerait le proxy d'images de Next.js.
 */
const supabaseHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return undefined;
  }
})();

/**
 * Hôte du fournisseur de tuiles cartographiques.
 *
 * La carte de repérage d'une annonce charge des images depuis un service tiers ;
 * la CSP doit donc l'autoriser explicitement en `img-src`. L'hôte est **dérivé
 * du gabarit de tuiles** plutôt qu'écrit en dur : changer de fournisseur via
 * `NEXT_PUBLIC_MAP_TILE_URL` met la CSP à jour du même geste, sans laisser
 * derrière soi une carte muette et une erreur de console incompréhensible.
 */
const mapTileHostname = (() => {
  const template =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  try {
    const url = new URL(template);
    return url.protocol === 'https:' ? url.hostname : undefined;
  } catch {
    return undefined;
  }
})();

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 * La CSP autorise uniquement Supabase en `connect-src`, et en `img-src` les
 * images du Storage Supabase plus les tuiles cartographiques.
 */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // `unsafe-inline` est requis par le runtime de Next.js (styles + hydratation).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      [
        "img-src 'self' blob: data:",
        supabaseHostname ? `https://${supabaseHostname}` : '',
        mapTileHostname ? `https://${mapTileHostname}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseHostname ? `https://${supabaseHostname} wss://${supabaseHostname}` : ''}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `standalone` produit un bundle minimal consommé par le Dockerfile multi-stage.
  output: 'standalone',
  images: {
    // AVIF d'abord : à qualité perçue égale, ~30 % de moins que WebP. Sur une
    // connexion mobile gabonaise, c'est ce qui coûte le plus cher au visiteur.
    formats: ['image/avif', 'image/webp'],
    /*
     * Largeurs générées, calées sur les tailles réellement demandées par les
     * composants (`sizes`). Chaque valeur superflue multiplie les variantes à
     * produire et à stocker sans bénéfice.
     */
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
    // Les images d'annonces ne changent pas : un an de cache navigateur.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    // Une image distante ne doit jamais pouvoir devenir un vecteur de script.
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
  /*
   * `optimizePackageImports` : `lucide-react` expose plus de mille icônes dans
   * un seul module. Sans cette option, importer trois icônes tire l'ensemble
   * dans le graphe de modules et alourdit sensiblement le bundle client.
   */
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    serverActions: {
      // Limite la taille des payloads d'actions serveur (upload d'images inclus).
      bodySizeLimit: '8mb',
    },
  },
  // En-tête `Server` retiré et compression activée côté Next : derrière un
  // proxy qui ne compresse pas (cas d'un Coolify mal réglé), c'est le seul
  // rempart contre des pages HTML servies en clair.
  compress: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      /*
       * Ressources au nom haché : immuables par construction. Un an de cache,
       * et `immutable` pour que le navigateur ne perde même pas un aller-retour
       * de revalidation.
       */
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/logo-daghoip-ikassa.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, must-revalidate' }],
      },
      /*
       * Le service worker, lui, ne doit JAMAIS être mis en cache : un worker
       * périmé continuerait de servir d'anciennes stratégies et deviendrait
       * impossible à corriger à distance.
       */
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
