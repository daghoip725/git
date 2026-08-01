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
 * En-têtes de sécurité appliqués à toutes les réponses.
 * La CSP autorise uniquement Supabase en `connect-src` et les images distantes
 * servies par le Storage Supabase.
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
      `img-src 'self' blob: data: ${supabaseHostname ? `https://${supabaseHostname}` : ''}`.trim(),
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
    formats: ['image/avif', 'image/webp'],
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
  experimental: {
    serverActions: {
      // Limite la taille des payloads d'actions serveur (upload d'images inclus).
      bodySizeLimit: '8mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
