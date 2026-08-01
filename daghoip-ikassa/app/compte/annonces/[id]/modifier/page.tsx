import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { ListingForm } from '@/components/listings/ListingForm';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCategories } from '@/services/categories.service';
import { getOwnedAdById } from '@/services/ads.service';
import { toUploaderImages } from '@/services/storage.service';

export const metadata: Metadata = {
  title: 'Modifier une annonce',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: PageProps) {
  const { id } = await params;

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=/compte/annonces/${id}/modifier`);

  // Renvoie `null` si l'annonce appartient à quelqu'un d'autre.
  const listing = await getOwnedAdById(parsedId.data, user.id);
  if (!listing) notFound();

  const categories = await getCategories();

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold text-brand-900">Modifier l’annonce</h1>
        <p className="mt-1 text-sm text-neutral-600">Référence {listing.reference}</p>
      </header>

      <ListingForm
        userId={user.id}
        categories={categories}
        mode="edit"
        initialValues={{
          id: listing.id,
          title: listing.title,
          description: listing.description,
          categoryId: listing.category_id,
          priceType: listing.price_type,
          price: listing.price,
          condition: listing.condition,
          city: listing.city,
          district: listing.district,
          contactPhone: listing.contact_phone,
          contactWhatsapp: listing.contact_whatsapp,
          allowMessages: listing.allow_messages,
          images: toUploaderImages(listing.images.map((image) => image.storage_path)),
        }}
      />
    </div>
  );
}
