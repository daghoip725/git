import { CalendarDays, Eye, MapPin, Tag } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { incrementViewsAction } from '@/app/actions/ads.actions';
import { recordAdViewAction } from '@/app/actions/history.actions';
import { CollapsibleText } from '@/components/common/CollapsibleText';
import { ContactActions } from '@/components/listings/ContactActions';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { ImageGallery } from '@/components/listings/ImageGallery';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { ListingMap } from '@/components/listings/ListingMap';
import { MessageSellerForm } from '@/components/listings/MessageSellerForm';
import { ReportDialog } from '@/components/listings/ReportDialog';
import { SellerCard } from '@/components/listings/SellerCard';
import { LocalViewRecorder } from '@/components/listings/LocalViewRecorder';
import { ShareButton } from '@/components/listings/ShareButton';
import { JsonLd, breadcrumbSchema } from '@/components/seo/JsonLd';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { getSiteUrl } from '@/lib/env';
import { getCurrentUser } from '@/lib/supabase/server';
import { getFavoriteAdIds, getAdByReference, getRelatedAds } from '@/services/ads.service';
import { getAdImageUrl } from '@/services/storage.service';
import { CONDITION_LABELS, SITE } from '@/utils/constants';
import { formatListingPrice, formatLongDate, formatRelativeDate, truncate } from '@/utils/format';
import { buildListingHref, extractReference } from '@/utils/slug';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const reference = extractReference(slug);
  const listing = reference ? await getAdByReference(reference) : null;

  if (!listing) {
    return { title: 'Annonce introuvable', robots: { index: false, follow: false } };
  }

  const price = formatListingPrice(listing.price, listing.price_type);
  const description = truncate(listing.description.replace(/\s+/g, ' '), 155);
  const path = buildListingHref(listing.slug, listing.reference);

  return {
    title: `${listing.title} — ${price} à ${listing.city}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: listing.title,
      description,
      type: 'website',
      // `url` explicite : sans lui, l'aperçu partagé pointe vers l'adresse
      // telle qu'elle a été copiée, paramètres de suivi compris.
      url: path,
      locale: 'fr_GA',
      siteName: SITE.name,
      /*
       * Aucune image déclarée ici : `opengraph-image.tsx` compose une carte
       * 1200×630 avec la photo, le titre, le prix et la ville. Redéclarer
       * `images` ferait gagner la photo brute — souvent carrée, rognée dans les
       * fils de discussion, et sans le prix, qui est ce qui décide du clic.
       */
    },
    twitter: { card: 'summary_large_image', title: listing.title, description },
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

  const listing = await getAdByReference(reference);
  if (!listing) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === listing.seller_id;

  const [related, favoriteIds] = await Promise.all([
    getRelatedAds(listing),
    user ? getFavoriteAdIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  // Le nombre d'annonces du vendeur est un compteur dénormalisé : plus besoin
  // d'une requête d'agrégation dédiée.
  const sellerAdsCount = listing.seller?.ads_count ?? 0;

  /*
   * Deux enregistrements distincts, et c'est volontaire :
   *  - `incrementViewsAction` alimente le compteur **public** de l'annonce ;
   *  - `recordAdViewAction` alimente l'historique **privé** du visiteur.
   * Les séparer permet d'effacer son historique sans faire baisser le compteur
   * d'une annonce — et de garder le compteur pour les visiteurs anonymes, qui
   * n'ont pas d'historique serveur.
   */
  if (!isOwner && listing.status === 'published') {
    await Promise.all([incrementViewsAction(listing.id), recordAdViewAction(listing.id)]);
  }

  const images = listing.images.flatMap((image, index) => {
    const url = getAdImageUrl(image.storage_path);
    return url ? [{ url, alt: `${listing.title} — photo ${index + 1}` }] : [];
  });

  const href = buildListingHref(listing.slug, listing.reference);
  const canonicalUrl = `${getSiteUrl()}${href}`;
  const price = formatListingPrice(listing.price, listing.price_type);
  const locationLabel = listing.district ? `${listing.district}, ${listing.city}` : listing.city;

  // Les deux coordonnées vont toujours de pair (le trigger écarte une valeur
  // orpheline) ; on les extrait ensemble pour que TypeScript le sache aussi.
  const position =
    listing.latitude !== null && listing.longitude !== null
      ? { latitude: listing.latitude, longitude: listing.longitude }
      : null;

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
      ...(position
        ? {
            availableAtOrFrom: {
              '@type': 'Place',
              address: { '@type': 'PostalAddress', addressLocality: listing.city },
              geo: { '@type': 'GeoCoordinates', ...position },
            },
          }
        : {}),
    },
  };

  return (
    <div className="container-app py-6 sm:py-8">
      {/* Produit + fil d'Ariane dans un même graphe : Google les relie par
          leurs identifiants plutôt que de les traiter comme deux pages. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            jsonLd,
            breadcrumbSchema(getSiteUrl(), [
              { name: 'Accueil', path: '/' },
              { name: 'Annonces', path: '/annonces' },
              ...(listing.category
                ? [
                    {
                      name: listing.category.name,
                      path: `/annonces?categorie=${listing.category.slug}`,
                    },
                  ]
                : []),
              { name: listing.title, path: href },
            ]),
          ],
        }}
      />

      {/* Historique local : seul recours pour un visiteur sans compte, qui n'a
          pas d'identité côté serveur. */}
      <LocalViewRecorder
        adId={listing.id}
        title={listing.title}
        href={href}
        isAuthenticated={Boolean(user)}
      />

      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-neutral-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-brand-800">
              Accueil
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/annonces" className="hover:text-brand-800">
              Annonces
            </Link>
          </li>
          {listing.category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/annonces?categorie=${listing.category.slug}`}
                  className="hover:text-brand-800"
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

      {/*
        Trois blocs dans une grille explicite. Sur mobile ils se suivent dans
        l'ordre du document — photos, prix, **contact**, puis description : le
        bouton d'appel se trouve donc avant le pavé de texte, là où il sert.
        À partir de `lg`, la colonne latérale occupe les deux rangées à droite.
      */}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ImageGallery images={images} title={listing.title} />

          <header className="mt-6">
            <h1 className="text-2xl leading-tight font-extrabold text-brand-900 sm:text-3xl">
              {listing.title}
            </h1>

            <p className="mt-2 text-3xl font-extrabold text-brand-800">{price}</p>

            <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-600">
              <li className="flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                {locationLabel}
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

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <FavoriteButton
                listingId={listing.id}
                initialIsFavorite={favoriteIds.has(listing.id)}
                isAuthenticated={Boolean(user)}
                variant="full"
              />
              <ShareButton title={listing.title} url={canonicalUrl} />
            </div>
          </header>
        </div>

        {/* ------------------------- Colonne latérale ------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-32 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
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
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-card p-4">
              <div>
                <h2 className="mb-3 font-bold text-brand-900">Contacter le vendeur</h2>
                <ContactActions
                  listingId={listing.id}
                  phone={listing.contact_phone}
                  whatsapp={listing.contact_whatsapp}
                  listingTitle={listing.title}
                  listingUrl={canonicalUrl}
                />
                {!listing.contact_phone && !listing.contact_whatsapp && !listing.allow_messages ? (
                  <p className="text-sm text-neutral-600">
                    Ce vendeur n’a laissé aucun moyen de contact pour le moment.
                  </p>
                ) : null}
              </div>

              {listing.allow_messages ? (
                <div className="border-t border-neutral-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-800">
                    Ou écrivez-lui directement
                  </h3>
                  <MessageSellerForm
                    listingId={listing.id}
                    listingTitle={listing.title}
                    isAuthenticated={Boolean(user)}
                    returnTo={href}
                  />
                </div>
              ) : null}
            </div>
          )}

          {listing.seller ? (
            <SellerCard seller={listing.seller} listingsCount={sellerAdsCount} />
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

        {/* ----------------------- Description et carte ----------------------- */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="description-title">
            <h2 id="description-title" className="text-lg font-bold text-brand-900">
              Description
            </h2>
            {/* Rendu en texte brut : aucun HTML utilisateur n'est interprété. */}
            <CollapsibleText className="mt-2">{listing.description}</CollapsibleText>
          </section>

          <section aria-labelledby="location-title" className="mt-8">
            <h2 id="location-title" className="text-lg font-bold text-brand-900">
              Localisation
            </h2>
            <p className="mt-1 mb-3 flex items-center gap-1.5 text-sm text-neutral-600">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {locationLabel}
            </p>

            {position ? (
              <ListingMap {...position} locationLabel={locationLabel} />
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
                Le vendeur n’a pas indiqué de position précise. Convenez du lieu de rendez-vous avec
                lui — de préférence dans un endroit public et fréquenté.
                <Link
                  href={`/annonces?ville=${encodeURIComponent(listing.city)}`}
                  className="mt-2 block font-semibold text-brand-800 underline underline-offset-2"
                >
                  Voir les annonces à {listing.city}
                </Link>
              </div>
            )}
          </section>

          <div className="mt-8">
            <ReportDialog listingId={listing.id} isAuthenticated={Boolean(user)} />
          </div>
        </div>
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
