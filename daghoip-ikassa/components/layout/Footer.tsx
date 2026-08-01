import { Mail, MapPin, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/common/Logo';
import { getRootCategories } from '@/services/categories.service';
import { SITE } from '@/utils/constants';

const COLUMNS = [
  {
    title: 'Daghoip Ikassa',
    links: [
      { href: '/a-propos', label: 'À propos' },
      { href: '/contact', label: 'Contact' },
      { href: '/securite', label: 'Conseils de sécurité' },
      { href: '/annonces', label: 'Toutes les annonces' },
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

export async function Footer() {
  const categories = (await getRootCategories()).slice(0, 8);

  return (
    <footer className="mt-16 bg-brand-800 text-white/85">
      <div className="container-app py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo inverted size={48} href={null} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              {SITE.tagline}. Achetez et vendez en toute confiance partout au Gabon.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-white/70">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              Libreville, Gabon
            </p>
            <a
              href={`mailto:${SITE.supportEmail}`}
              className="mt-1.5 flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-gold-300"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {SITE.supportEmail}
            </a>
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

        <div className="mt-10 flex flex-col gap-4 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
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
