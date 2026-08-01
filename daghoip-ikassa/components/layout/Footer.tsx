import { Mail, MapPin, ShieldCheck, Smartphone } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/common/Logo';
import { getRootCategories } from '@/services/categories.service';
import { GABON_CITIES, GABON_PROVINCES, SITE } from '@/utils/constants';

const COLUMNS = [
  {
    title: 'La plateforme',
    links: [
      { href: '/a-propos', label: 'À propos' },
      { href: '/annonces', label: 'Toutes les annonces' },
      { href: '/categories', label: 'Toutes les catégories' },
      { href: '/annonces/nouvelle', label: 'Déposer une annonce' },
    ],
  },
  {
    title: 'Aide & sécurité',
    links: [
      { href: '/securite', label: 'Conseils de sécurité' },
      { href: '/contact', label: 'Nous contacter' },
      { href: '/compte/verification', label: 'Devenir vendeur vérifié' },
    ],
  },
  {
    title: 'Informations légales',
    links: [
      { href: '/conditions', label: 'Conditions d’utilisation' },
      { href: '/confidentialite', label: 'Politique de confidentialité' },
      { href: '/cookies', label: 'Gestion des cookies' },
    ],
  },
];

/** Villes les plus actives, en accès direct (utile aux visiteurs et au référencement). */
const FEATURED_CITIES = GABON_CITIES.slice(0, 12).map((city) => city.name);

export async function Footer() {
  const categories = (await getRootCategories()).slice(0, 8);

  return (
    <footer className="mt-16 bg-brand-800 text-white/85">
      {/* --------------------------- Bandeau confiance -------------------------- */}
      <div className="border-b border-white/10 bg-brand-900/40">
        <div className="container-app grid gap-6 py-8 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: 'Vendeurs vérifiés',
              text: 'Un badge délivré après contrôle des pièces d’identité.',
            },
            {
              icon: Smartphone,
              title: 'Contact direct',
              text: 'Téléphone, WhatsApp ou messagerie interne, sans intermédiaire.',
            },
            {
              icon: MapPin,
              title: 'Partout au Gabon',
              text: `Les ${GABON_PROVINCES.length} provinces couvertes, de Libreville à Bitam.`,
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-400">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/60">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------ Corps du pied --------------------------- */}
      <div className="container-app py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo inverted size={48} href={null} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              {SITE.tagline}. Achetez et vendez en toute confiance, gratuitement et sans commission.
            </p>

            <address className="mt-5 space-y-1.5 not-italic">
              <p className="flex items-center gap-2 text-sm text-white/70">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                Libreville, Gabon
              </p>
              <a
                href={`mailto:${SITE.supportEmail}`}
                className="flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-gold-300"
              >
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                {SITE.supportEmail}
              </a>
            </address>
          </div>

          <div>
            <h2 className="text-sm font-bold tracking-wide text-gold-400 uppercase">Catégories</h2>
            <ul className="mt-4 space-y-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/annonces?categorie=${category.slug}`}
                    className="text-sm text-white/70 transition-colors hover:text-gold-300"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-bold tracking-wide text-gold-400 uppercase">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-gold-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* --------------------------- Annonces par ville -------------------------- */}
        <nav aria-label="Annonces par ville" className="mt-10 border-t border-white/10 pt-6">
          <h2 className="text-xs font-bold tracking-wide text-white/50 uppercase">
            Annonces par ville
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {FEATURED_CITIES.map((city) => (
              <li key={city}>
                <Link
                  href={`/annonces?ville=${encodeURIComponent(city)}`}
                  className="text-xs text-white/60 transition-colors hover:text-gold-300"
                >
                  {city}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* --------------------------------- Bas de page --------------------------- */}
      <div className="border-t border-white/10">
        <div className="container-app flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/60">
            © {new Date().getFullYear()} {SITE.name}. Tous droits réservés.
          </p>
          <p className="flex items-center gap-2 text-xs text-white/60">
            <ShieldCheck className="size-4 text-gold-400" aria-hidden="true" />
            Ne payez jamais avant d’avoir vu l’article.
          </p>
        </div>
      </div>
    </footer>
  );
}
