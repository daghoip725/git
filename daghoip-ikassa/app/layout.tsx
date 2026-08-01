import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { getSiteUrl } from '@/lib/env';
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
    images: [{ url: SITE.logo, width: 1240, height: 1240, alt: SITE.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [SITE.logo],
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
  themeColor: BRAND_COLORS.primary,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
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
      </body>
    </html>
  );
}
