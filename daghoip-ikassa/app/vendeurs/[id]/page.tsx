import {
  Briefcase,
  CalendarDays,
  Heart,
  ListOrdered,
  MapPin,
  Pencil,
  Phone,
  Star,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { VerifiedBadge } from '@/components/common/VerifiedBadge';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { RatingStars } from '@/components/profile/RatingStars';
import { ReviewForm } from '@/components/profile/ReviewForm';
import { ReviewList } from '@/components/profile/ReviewList';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getAdsBySeller, getFavoriteAdIds, getFavoriteAds } from '@/services/ads.service';
import { canReview, getReviewsForUser } from '@/services/reviews.service';
import { getAvatarUrl } from '@/services/storage.service';
import { getMyProfile, getPublicUser } from '@/services/users.service';
import { SITE } from '@/utils/constants';
import { formatLongDate } from '@/utils/format';
import { formatGabonPhoneNational } from '@/utils/phone';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const parsed = z.string().uuid().safeParse(id);
  const seller = parsed.success ? await getPublicUser(parsed.data) : null;

  if (!seller) {
    return { title: 'Profil introuvable', robots: { index: false, follow: false } };
  }

  const location = seller.city ? ` à ${seller.city}` : ' au Gabon';

  return {
    title: `${seller.full_name} — ${seller.ads_count} annonce${seller.ads_count > 1 ? 's' : ''}${location}`,
    description:
      seller.bio?.slice(0, 155) ??
      `Retrouvez les annonces de ${seller.full_name}${location} sur ${SITE.name}.`,
    alternates: { canonical: `/vendeurs/${seller.id}` },
  };
}

/**
 * Profil d'un utilisateur.
 *
 * La page a **deux visages sans être deux pages** : tout le monde voit la
 * photo, le nom, la ville, la description, la note et les annonces ; le
 * propriétaire voit en plus ce que la base ne rend jamais public — son
 * téléphone et ses favoris — ainsi que le bouton de modification.
 *
 * Ce n'est pas un choix d'affichage mais une conséquence du schéma :
 * `users.phone` est hors du `GRANT SELECT` public et `favorites` est protégée
 * par une RLS « propriétaire uniquement ». Même en forgeant la requête, un
 * visiteur ne les obtiendrait pas.
 */
export default async function SellerProfilePage({ params }: PageProps) {
  const { id } = await params;

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const seller = await getPublicUser(parsedId.data);
  if (!seller) notFound();

  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === seller.id;

  const [ads, reviews, favoriteIds, myProfile, favorites, mayReview] = await Promise.all([
    getAdsBySeller(seller.id),
    getReviewsForUser(seller.id),
    viewer ? getFavoriteAdIds(viewer.id) : Promise.resolve(new Set<string>()),
    isOwner ? getMyProfile() : Promise.resolve(null),
    isOwner && viewer ? getFavoriteAds(viewer.id) : Promise.resolve([]),
    viewer && !isOwner ? canReview(viewer.id, seller.id, null) : Promise.resolve(false),
  ]);

  const alreadyReviewed = viewer
    ? reviews.some((review) => review.reviewer_id === viewer.id)
    : false;

  return (
    <div className="container-app max-w-5xl py-6 sm:py-10">
      {/* ------------------------------- En-tête ------------------------------- */}
      <header className="rounded-xl border border-neutral-200 bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={seller.full_name} src={getAvatarUrl(seller.avatar_path)} size={88} />

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-brand-900">
              {seller.full_name}
              {seller.is_verified ? <VerifiedBadge /> : null}
            </h1>

            <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-neutral-600">
              {seller.city ? (
                <li className="flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  {seller.city}
                  {seller.province ? `, ${seller.province}` : ''}
                </li>
              ) : null}
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                Membre depuis {formatLongDate(seller.created_at)}
              </li>
              <li className="flex items-center gap-1.5">
                <ListOrdered className="size-4 shrink-0" aria-hidden="true" />
                {seller.ads_count} annonce{seller.ads_count > 1 ? 's' : ''} en ligne
              </li>
            </ul>

            {/* Note moyenne : la valeur brute est dénormalisée et maintenue par
                trigger à chaque avis publié. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {seller.rating_count > 0 ? (
                <>
                  <RatingStars value={seller.rating_average} size="lg" />
                  <span className="text-lg font-bold text-brand-900">
                    {seller.rating_average.toLocaleString('fr-GA', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-sm text-neutral-500">
                    sur 5 · {seller.rating_count} avis
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-neutral-500">
                  <Star className="size-4" aria-hidden="true" />
                  Pas encore d’avis
                </span>
              )}
            </div>

            {seller.is_professional ? (
              <Badge tone="gold" className="mt-3">
                <Briefcase className="size-3" aria-hidden="true" />
                {seller.business_name ?? 'Vendeur professionnel'}
              </Badge>
            ) : null}
          </div>

          {isOwner ? (
            <div className="shrink-0">
              <ButtonLink href="/compte/profil" variant="outline">
                <Pencil className="size-4" aria-hidden="true" />
                Modifier le profil
              </ButtonLink>
            </div>
          ) : null}
        </div>

        {seller.bio ? (
          <section aria-labelledby="bio-title" className="mt-5 border-t border-neutral-100 pt-4">
            <h2 id="bio-title" className="text-sm font-semibold text-neutral-800">
              À propos
            </h2>
            {/* Rendu en texte brut : aucun HTML utilisateur n'est interprété. */}
            <p className="mt-1 leading-relaxed whitespace-pre-line text-neutral-700">
              {seller.bio}
            </p>
          </section>
        ) : isOwner ? (
          <p className="mt-5 border-t border-neutral-100 pt-4 text-sm text-neutral-500">
            Ajoutez une description : elle rassure les acheteurs et figure sur toutes vos annonces.{' '}
            <Link
              href="/compte/profil"
              className="font-semibold text-brand-800 underline underline-offset-2"
            >
              La rédiger
            </Link>
          </p>
        ) : null}

        {/* Coordonnées : visibles du seul propriétaire. `users.phone` est hors
            du GRANT SELECT public — un visiteur ne les obtiendrait pas même en
            interrogeant l'API directement. */}
        {isOwner && myProfile ? (
          <section
            aria-labelledby="contact-title"
            className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm"
          >
            <h2 id="contact-title" className="font-semibold text-neutral-800">
              Vos coordonnées
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-neutral-700">
              <span className="flex items-center gap-1.5">
                <Phone className="size-4 shrink-0" aria-hidden="true" />
                {myProfile.phone ? formatGabonPhoneNational(myProfile.phone) : 'Non renseigné'}
              </span>
              {myProfile.whatsapp ? (
                <span>WhatsApp : {formatGabonPhoneNational(myProfile.whatsapp)}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Visible de vous seul. Sur vos annonces, le numéro n’apparaît qu’après un clic de
              l’acheteur — jamais dans la page envoyée au navigateur.
            </p>
          </section>
        ) : null}
      </header>

      {/* ------------------------------ Annonces ------------------------------ */}
      <section aria-labelledby="ads-title" className="mt-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ads-title" className="text-xl font-extrabold text-brand-900">
            Annonces de {seller.full_name}
          </h2>
          {isOwner ? (
            <Link
              href="/compte/annonces"
              className="text-sm font-semibold text-brand-800 underline underline-offset-2"
            >
              Gérer mes annonces
            </Link>
          ) : null}
        </div>

        {ads.length > 0 ? (
          <ListingGrid
            listings={ads}
            favoriteIds={favoriteIds}
            isAuthenticated={Boolean(viewer)}
            priorityCount={0}
          />
        ) : (
          <EmptyState
            icon={ListOrdered}
            title="Aucune annonce en ligne"
            description={
              isOwner
                ? 'Vos annonces publiées apparaîtront ici, telles que les acheteurs les voient.'
                : 'Ce vendeur n’a pas d’annonce publiée pour le moment.'
            }
            action={
              isOwner ? (
                <ButtonLink href="/annonces/nouvelle">Déposer une annonce</ButtonLink>
              ) : undefined
            }
          />
        )}
      </section>

      {/* ------------------------------ Favoris ------------------------------- */}
      {isOwner ? (
        <section aria-labelledby="favorites-title" className="mt-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="favorites-title"
              className="flex items-center gap-2 text-xl font-extrabold text-brand-900"
            >
              <Heart className="size-5 text-brand-600" aria-hidden="true" />
              Mes favoris
            </h2>
            <Link
              href="/compte/favoris"
              className="text-sm font-semibold text-brand-800 underline underline-offset-2"
            >
              Tout voir
            </Link>
          </div>

          {favorites.length > 0 ? (
            <ListingGrid
              listings={favorites.slice(0, 8)}
              favoriteIds={favoriteIds}
              isAuthenticated
              priorityCount={0}
            />
          ) : (
            <EmptyState
              icon={Heart}
              title="Aucun favori"
              description="Touchez le cœur d’une annonce pour la retrouver ici. Vos favoris ne sont visibles que de vous."
              action={<ButtonLink href="/annonces">Parcourir les annonces</ButtonLink>}
            />
          )}
        </section>
      ) : null}

      {/* -------------------------------- Avis -------------------------------- */}
      <section aria-labelledby="reviews-title" className="mt-10">
        <h2 id="reviews-title" className="mb-4 text-xl font-extrabold text-brand-900">
          Avis {seller.rating_count > 0 ? `(${seller.rating_count})` : ''}
        </h2>

        {mayReview && !alreadyReviewed ? (
          <div className="mb-4">
            <ReviewForm revieweeId={seller.id} revieweeName={seller.full_name} />
          </div>
        ) : null}

        <ReviewList reviews={reviews} isReviewee={isOwner} />
      </section>
    </div>
  );
}
