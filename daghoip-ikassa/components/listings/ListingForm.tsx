'use client';

/**
 * Formulaire de dépôt / modification d'une annonce.
 *
 * Fonctionnement :
 *  1. un identifiant d'annonce est généré côté client (mode création) afin de
 *     servir de dossier de destination aux photos ;
 *  2. les photos partent directement vers Supabase Storage ;
 *  3. la Server Action reçoit les champs + les chemins d'images, revalide le
 *     tout avec Zod, puis écrit en base sous contrôle RLS.
 */
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';

import { createAdAction, updateAdAction } from '@/app/actions/ads.actions';
import { ImageUploader } from '@/components/listings/ImageUploader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import type { UploaderImage } from '@/services/storage.service';
import type { ActionResult, Category, AdCondition, PriceType } from '@/types';
import {
  CONDITION_LABELS,
  GABON_CITY_NAMES,
  LISTING_LIMITS,
  PRICE_TYPE_LABELS,
} from '@/utils/constants';
import { formatGabonPhone } from '@/utils/phone';

export interface ListingFormValues {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  priceType: PriceType;
  price: number | null;
  condition: AdCondition | null;
  city: string;
  district: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  allowMessages: boolean;
  images: UploaderImage[];
}

export interface ListingFormProps {
  userId: string;
  categories: Category[];
  mode: 'create' | 'edit';
  /** Valeurs initiales (mode édition) ou pré-remplissage depuis le profil. */
  initialValues?: Partial<ListingFormValues>;
  defaultPhone?: string | null;
  defaultWhatsapp?: string | null;
}

const PRICE_TYPE_OPTIONS = (Object.keys(PRICE_TYPE_LABELS) as PriceType[]).map((value) => ({
  value,
  label: PRICE_TYPE_LABELS[value],
}));

const CONDITION_OPTIONS = (Object.keys(CONDITION_LABELS) as AdCondition[]).map((value) => ({
  value,
  label: CONDITION_LABELS[value],
}));

const CITY_OPTIONS = GABON_CITY_NAMES.map((city) => ({ value: city, label: city }));

export function ListingForm({
  userId,
  categories,
  mode,
  initialValues,
  defaultPhone,
  defaultWhatsapp,
}: ListingFormProps) {
  const router = useRouter();

  // Identifiant stable pour toute la durée de vie du formulaire.
  const [listingId] = useState(() => initialValues?.id ?? crypto.randomUUID());

  const [priceType, setPriceType] = useState<PriceType>(initialValues?.priceType ?? 'fixed');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [images, setImages] = useState<UploaderImage[]>(initialValues?.images ?? []);

  const action = mode === 'create' ? createAdAction : updateAdAction;
  const [state, formAction, isPending] = useActionState<
    ActionResult<{ href: string }> | null,
    FormData
  >(action, null);

  useEffect(() => {
    if (state?.success) router.push(state.data.href);
  }, [state, router]);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.parent_id ? `— ${category.name}` : category.name,
      })),
    [categories],
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  const priceRequired = priceType === 'fixed' || priceType === 'negotiable';

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="listingId" value={listingId} />

      {/* ------------------------------ Photos ------------------------------ */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-brand-900">Photos</h2>
          <p className="text-sm text-neutral-600">
            Des photos nettes et lumineuses augmentent fortement vos chances de vendre.
          </p>
        </div>
        <ImageUploader
          userId={userId}
          listingId={listingId}
          initialImages={initialValues?.images ?? []}
          onChange={setImages}
        />
      </section>

      {/* --------------------------- Informations --------------------------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-900">Informations sur l’article</h2>

        <Input
          name="title"
          label="Titre de l’annonce"
          required
          maxLength={LISTING_LIMITS.titleMax}
          defaultValue={initialValues?.title}
          placeholder="Ex. Toyota RAV4 2018 en très bon état"
          hint="Soyez précis : marque, modèle, état. N’indiquez pas votre numéro ici."
          error={fieldError('title')}
        />

        <Select
          name="categoryId"
          label="Catégorie"
          required
          options={categoryOptions}
          placeholder="Choisissez une catégorie"
          defaultValue={initialValues?.categoryId}
          error={fieldError('categoryId')}
        />

        <div className="relative">
          <Textarea
            name="description"
            label="Description"
            required
            rows={8}
            minLength={LISTING_LIMITS.descriptionMin}
            maxLength={LISTING_LIMITS.descriptionMax}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Décrivez l’article : caractéristiques, état, raison de la vente, modalités de remise…"
            error={fieldError('description')}
          />
          <p className="mt-1 text-right text-xs text-neutral-400" aria-live="polite">
            {description.length} / {LISTING_LIMITS.descriptionMax}
          </p>
        </div>

        <Select
          name="condition"
          label="État de l’article"
          options={CONDITION_OPTIONS}
          placeholder="Non précisé"
          defaultValue={initialValues?.condition ?? ''}
          error={fieldError('condition')}
        />
      </section>

      {/* ------------------------------- Prix ------------------------------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-900">Prix</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            name="priceType"
            label="Modalité"
            required
            options={PRICE_TYPE_OPTIONS}
            value={priceType}
            onChange={(event) => setPriceType(event.target.value as PriceType)}
            error={fieldError('priceType')}
          />

          <Input
            name="price"
            label="Prix"
            type="number"
            inputMode="numeric"
            min={0}
            max={LISTING_LIMITS.priceMax}
            step={1}
            required={priceRequired}
            disabled={!priceRequired}
            defaultValue={initialValues?.price ?? undefined}
            placeholder="0"
            prefix="FCFA"
            hint={priceRequired ? undefined : 'Non applicable pour cette modalité.'}
            error={fieldError('price')}
          />
        </div>
      </section>

      {/* ---------------------------- Localisation --------------------------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-900">Localisation</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            name="city"
            label="Ville"
            required
            options={CITY_OPTIONS}
            placeholder="Choisissez une ville"
            defaultValue={initialValues?.city}
            error={fieldError('city')}
          />

          <Input
            name="district"
            label="Quartier (facultatif)"
            maxLength={80}
            defaultValue={initialValues?.district ?? ''}
            placeholder="Ex. Nzeng-Ayong"
            error={fieldError('district')}
          />
        </div>
      </section>

      {/* ------------------------------ Contact ------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-900">Vos coordonnées</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="contactPhone"
            label="Téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={
              initialValues?.contactPhone
                ? formatGabonPhone(initialValues.contactPhone)
                : defaultPhone
                  ? formatGabonPhone(defaultPhone)
                  : ''
            }
            placeholder="06 12 34 56 78"
            hint="Le numéro n’est révélé qu’après un clic de l’acheteur."
            error={fieldError('contactPhone')}
          />

          <Input
            name="contactWhatsapp"
            label="WhatsApp (facultatif)"
            type="tel"
            inputMode="tel"
            defaultValue={
              initialValues?.contactWhatsapp
                ? formatGabonPhone(initialValues.contactWhatsapp)
                : defaultWhatsapp
                  ? formatGabonPhone(defaultWhatsapp)
                  : ''
            }
            placeholder="06 12 34 56 78"
            error={fieldError('contactWhatsapp')}
          />
        </div>

        <Checkbox
          name="allowMessages"
          label="Autoriser les acheteurs à me contacter par la messagerie du site"
          defaultChecked={initialValues?.allowMessages ?? true}
        />
      </section>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-b-xl">
        {mode === 'create' ? (
          <Button
            type="submit"
            name="publish"
            value="false"
            variant="outline"
            size="lg"
            disabled={isPending}
          >
            Enregistrer comme brouillon
          </Button>
        ) : null}

        <Button type="submit" size="lg" isLoading={isPending}>
          {mode === 'create' ? 'Publier mon annonce' : 'Enregistrer les modifications'}
        </Button>
      </div>

      <p className="text-xs text-neutral-500">
        {images.length} photo{images.length > 1 ? 's' : ''} sélectionnée
        {images.length > 1 ? 's' : ''}. En publiant, vous acceptez les{' '}
        <a href="/conditions" className="text-brand-700 underline underline-offset-2">
          conditions d’utilisation
        </a>
        .
      </p>
    </form>
  );
}
