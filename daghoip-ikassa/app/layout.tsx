import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import { Footer } from '@/components/layout/Footer';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { Header } from '@/components/layout/Header';
import { getSiteUrl } from '@/lib/env';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { BRAND_COLORS, SITE } from '@/utils/constants';

import '@/styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    'petites annonces Gabon',
    'annonces Libreville',
    'vendre au Gabon',
    'acheter Gabon',
    'occasion Gabon',
    'Port-Gentil',
    'Franceville',
  ],
  authors: [{ name: SITE.name }],
  openGraph: {
    type: 'website',
    locale: 'fr_GA',
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    /*
     * Aucune image déclarée : `app/opengraph-image.tsx` en compose une au bon
     * format (1200×630). Le logo carré déclaré ici auparavant s'affichait rogné
     * dans les fils WhatsApp et Facebook, où l'aperçu attend un rectangle.
     */
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  icons: {
    icon: SITE.logo,
    apple: SITE.logo,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  /*
   * La couleur de la barre d'adresse suit le thème : sur Android, un en-tête
   * vert foncé au-dessus d'une page sombre est cohérent, au-dessus d'une page
   * claire aussi — mais l'inverse jure.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND_COLORS.primary },
    { media: '(prefers-color-scheme: dark)', color: '#0d1310' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` : le script ci-dessous pose `data-theme` avant
    // l'hydratation, l'attribut diffère donc du HTML rendu par le serveur — qui
    // ne peut pas connaître le choix de l'utilisateur. C'est attendu, et c'est
    // le seul endroit du projet où cette suppression est justifiée.
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Avant peinture : évite l'éclair blanc au chargement en mode sombre. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        {/* Lien d'évitement : premier élément focalisable de la page. */}
        <a
          href="#contenu-principal"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Aller au contenu principal
        </a>

        <Suspense fallback={<div className="h-28 bg-brand-700" />}>
          <Header />
        </Suspense>

        <main id="contenu-principal" className="flex-1">
          {children}
        </main>

        <Suspense fallback={null}>
          <Footer />
        </Suspense>

        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
