import { CalendarDays, Eye, MapPin, Tag } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { incrementViewsAction } from '@/app/actions/listings.actions';
import { ContactActions } from '@/components/listings/ContactActions';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { ImageGallery } from '@/components/listings/ImageGallery';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { ReportDialog } from '@/components/listings/ReportDialog';
import { SellerCard } from '@/components/listings/SellerCard';
import { ShareButton } from '@/components/listings/ShareButton';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { getSiteUrl } from '@/lib/env';
import { getCurrentUser } from '@/lib/supabase/server';
import {
  getFavoriteListingIds,
  getListingByReference,
  getRelatedListings,
} from '@/services/listings.service';
import { countPublishedListings } from '@/services/profiles.service';
import { getPublicImageUrl } from '@/services/storage.service';
import { CONDITION_LABELS, SITE } from '@/utils/constants';
import { formatListingPrice, formatLongDate, formatRelativeDate, truncate } from '@/utils/format';
import { buildListingHref, extractReference } from '@/utils/slug';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const reference = extractReference(slug);
  const listing = reference ? await getListingByReference(reference) : null;

  if (!listing) {
    return { title: 'Annonce introuvable', robots: { index: false, follow: false } };
  }

  const price = formatListingPrice(listing.price, listing.price_type);
  const description = truncate(listing.description.replace(/\s+/g, ' '), 155);
  const coverUrl = getPublicImageUrl(listing.images[0]?.storage_path);

  return {
    title: `${listing.title} — ${price} à ${listing.city}`,
    description,
    alternates: { canonical: buildListingHref(listing.slug, listing.reference) },
    openGraph: {
      title: listing.title,
      description,
      type: 'website',
      images: coverUrl ? [{ url: coverUrl, alt: listing.title }] : undefined,
    },
    robots:
      listing.status === 'published'
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const reference = extractReference(slug);
  if (!reference) notFound();

  const listing = await getListingByReference(reference);
  if (!listing) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === listing.seller_id;

  const [related, favoriteIds, sellerListingsCount] = await Promise.all([
    getRelatedListings(listing),
    user ? getFavoriteListingIds(user.id) : Promise.resolve(new Set<string>()),
    listing.seller ? countPublishedListings(listing.seller.id) : Promise.resolve(0),
  ]);

  // Compteur de vues : jamais incrémenté par le propriétaire de l'annonce.
  if (!isOwner && listing.status === 'published') {
    await incrementViewsAction(listing.id);
  }

  const images = listing.images.flatMap((image, index) => {
    const url = getPublicImageUrl(image.storage_path);
    return url ? [{ url, alt: `${listing.title} — photo ${index + 1}` }] : [];
  });

  const canonicalUrl = `${getSiteUrl()}${buildListingHref(listing.slug, listing.reference)}`;
  const price = formatListingPrice(listing.price, listing.price_type);

  /** Données structurées Schema.org pour le référencement. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: truncate(listing.description.replace(/\s+/g, ' '), 400),
    image: images.map((image) => image.url),
    sku: listing.reference,
    offers: {
      '@type': 'Offer',
      price: listing.price ?? 0,
      priceCurrency: 'XAF',
      availability:
        listing.status === 'published'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
      url: canonicalUrl,
      areaServed: { '@type': 'Country', name: 'Gabon' },
    },
  };

  return (
    <div className="container-app py-6 sm:py-8">
      <script
        type="application/ld+json"
        // Contenu généré par nous à partir de données typées : pas d'injection possible.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-neutral-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-brand-700">
              Accueil
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/annonces" className="hover:text-brand-700">
              Annonces
            </Link>
          </li>
          {listing.category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/annonces?categorie=${listing.category.slug}`}
                  className="hover:text-brand-700"
                >
                  {listing.category.name}
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      {listing.status !== 'published' ? (
        <Alert tone="warning" className="mb-4">
          Cette annonce n’est pas publiquement visible
          {listing.status === 'sold' ? ' : elle est marquée comme vendue.' : '.'}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-8">
        <div className="min-w-0">
          <ImageGallery images={images} title={listing.title} />

          <article className="mt-6">
            <h1 className="text-2xl leading-tight font-extrabold text-brand-900 sm:text-3xl">
              {listing.title}
            </h1>

            <p className="mt-2 text-3xl font-extrabold text-brand-700">{price}</p>

            <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-600">
              <li className="flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                {listing.city}
                {listing.district ? `, ${listing.district}` : ''}
              </li>
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                <time dateTime={listing.published_at ?? listing.created_at}>
                  {formatRelativeDate(listing.published_at ?? listing.created_at)}
                </time>
              </li>
              <li className="flex items-center gap-1.5">
                <Eye className="size-4 shrink-0" aria-hidden="true" />
                {listing.views_count} vue{listing.views_count > 1 ? 's' : ''}
              </li>
              <li className="flex items-center gap-1.5">
                <Tag className="size-4 shrink-0" aria-hidden="true" />
                Réf. {listing.reference}
              </li>
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              {listing.condition ? (
                <Badge tone="brand">{CONDITION_LABELS[listing.condition]}</Badge>
              ) : null}
              {listing.category ? <Badge tone="neutral">{listing.category.name}</Badge> : null}
              {listing.is_featured ? <Badge tone="gold">À la une</Badge> : null}
            </div>

            <section aria-labelledby="description-title" className="mt-8">
              <h2 id="description-title" className="text-lg font-bold text-brand-900">
                Description
              </h2>
              {/* Rendu en texte brut : aucun HTML utilisateur n'est interprété. */}
              <p className="mt-2 leading-relaxed whitespace-pre-line text-neutral-700">
                {listing.description}
              </p>
            </section>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <FavoriteButton
                listingId={listing.id}
                initialIsFavorite={favoriteIds.has(listing.id)}
                isAuthenticated={Boolean(user)}
                variant="full"
              />
              <ShareButton title={listing.title} url={canonicalUrl} />
            </div>

            <div className="mt-4">
              <ReportDialog listingId={listing.id} isAuthenticated={Boolean(user)} />
            </div>
          </article>
        </div>

        {/* ------------------------- Colonne latérale ------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          {isOwner ? (
            <Alert tone="info" title="Ceci est votre annonce">
              <Link
                href={`/compte/annonces/${listing.id}/modifier`}
                className="font-semibold underline underline-offset-2"
              >
                Modifier l’annonce
              </Link>
            </Alert>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 font-bold text-brand-900">Contacter le vendeur</h2>
              <ContactActions
                phone={listing.contact_phone}
                whatsapp={listing.contact_whatsapp}
                listingTitle={listing.title}
                listingUrl={canonicalUrl}
              />
              {!listing.contact_phone && !listing.contact_whatsapp ? (
                <p className="text-sm text-neutral-600">
                  Ce vendeur préfère être contacté via la messagerie du site.
                </p>
              ) : null}
            </div>
          )}

          {listing.seller ? (
            <SellerCard seller={listing.seller} listingsCount={sellerListingsCount} />
          ) : null}

          <Alert tone="warning" title="Conseils de sécurité">
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
              <li>Rencontrez le vendeur dans un lieu public et fréquenté.</li>
              <li>Vérifiez l’article avant tout paiement.</li>
              <li>N’envoyez jamais d’argent par Mobile Money à un inconnu.</li>
            </ul>
            <Link
              href="/securite"
              className="mt-2 inline-block text-xs font-semibold underline underline-offset-2"
            >
              Lire tous nos conseils
            </Link>
          </Alert>

          <p className="text-xs text-neutral-500">
            Annonce publiée le {formatLongDate(listing.published_at ?? listing.created_at)} sur{' '}
            {SITE.name}.
          </p>
        </aside>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-14">
          <h2 id="related-title" className="mb-5 text-xl font-extrabold text-brand-900">
            Annonces similaires
          </h2>
          <ListingGrid
            listings={related}
            favoriteIds={favoriteIds}
            isAuthenticated={Boolean(user)}
            priorityCount={0}
          />
        </section>
      ) : null}
    </div>
  );
}
