'use client';

/**
 * Formulaire de dépôt / modification d'une annonce.
 *
 * Fonctionnement :
 *  1. un identifiant d'annonce est généré côté client (mode création) afin de
 *     servir de dossier de destination aux photos ;
 *  2. les photos partent directement vers Supabase Storage ;
 *  3. la saisie est validée **en direct** par le schéma Zod partagé — le même
 *     que celui de la Server Action — pour un retour immédiat ;
 *  4. la Server Action reçoit les champs + les chemins d'images, revalide le
 *     tout, puis écrit en base sous contrôle RLS.
 *
 * La validation côté client n'est qu'un confort : elle n'empêche rien. Le
 * serveur revalide, et PostgreSQL (contraintes, triggers, RLS) a le dernier mot
 * — y compris pour l'expiration, bornée à 7–90 jours, et pour le filtre de
 * contenu qui bascule une annonce douteuse en `pending_review`.
 */
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';

import { createAdAction, updateAdAction } from '@/app/actions/ads.actions';
import { GeoLocationField } from '@/components/listings/GeoLocationField';
import { ImageUploader } from '@/components/listings/ImageUploader';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { useDraft } from '@/hooks/useDraft';
import { useLiveValidation } from '@/hooks/useLiveValidation';
import type { UploaderImage } from '@/services/storage.service';
import type {
  ActionResult,
  AdActionData,
  AdCondition,
  AdFeaturePlan,
  Category,
  PriceType,
} from '@/types';
import {
  CONDITION_LABELS,
  GABON_CITY_NAMES,
  LISTING_LIMITS,
  PRICE_TYPE_LABELS,
} from '@/utils/constants';
import { formatPrice, formatRelativeDate } from '@/utils/format';
import { formatGabonPhoneNational } from '@/utils/phone';
import {
  PUBLICATION_DURATIONS,
  listingFormSchema,
  type ListingFormInput,
} from '@/utils/validation';

/**
 * L'état du formulaire est **exactement** l'entrée du schéma Zod : une seule
 * forme de données du champ de saisie jusqu'à la base.
 */
type FormState = ListingFormInput;

/** Valeurs de pré-remplissage acceptées par la page appelante. */
export interface ListingFormValues extends FormState {
  id: string;
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
  /** Catalogue des offres de mise en avant ; vide = section masquée. */
  featurePlans?: AdFeaturePlan[];
  /** En édition : l'annonce bénéficie déjà d'une mise en avant en cours. */
  isFeatured?: boolean;
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

const DURATION_OPTIONS = PUBLICATION_DURATIONS.map((days) => ({
  value: String(days),
  label: `${days} jours`,
}));

/** Clé du brouillon local : une seule annonce en cours de rédaction à la fois. */
const DRAFT_KEY = 'ikassa:brouillon:annonce';

/**
 * Un numéro déjà normalisé (E.164) est réaffiché au format local, celui-là
 * même que suggère l'aide de saisie : « 06 12 34 56 » plutôt que « +241 … ».
 */
function displayPhone(value: string | null | undefined): string {
  return value ? formatGabonPhoneNational(value) : '';
}

export function ListingForm({
  userId,
  categories,
  mode,
  initialValues,
  defaultPhone,
  defaultWhatsapp,
  featurePlans = [],
  isFeatured = false,
}: ListingFormProps) {
  const router = useRouter();

  // Identifiant stable pour toute la durée de vie du formulaire.
  const [listingId] = useState(() => initialValues?.id ?? crypto.randomUUID());
  const [images, setImages] = useState<UploaderImage[]>(initialValues?.images ?? []);

  const initialState = useMemo<FormState>(
    () => ({
      title: initialValues?.title ?? '',
      description: initialValues?.description ?? '',
      categoryId: initialValues?.categoryId ?? '',
      priceType: initialValues?.priceType ?? 'fixed',
      price: initialValues?.price ?? null,
      condition: initialValues?.condition ?? null,
      city: initialValues?.city ?? '',
      district: initialValues?.district ?? null,
      contactPhone: displayPhone(initialValues?.contactPhone ?? defaultPhone),
      contactWhatsapp: displayPhone(initialValues?.contactWhatsapp ?? defaultWhatsapp),
      allowMessages: initialValues?.allowMessages ?? true,
      latitude: initialValues?.latitude ?? null,
      longitude: initialValues?.longitude ?? null,
      // En édition, l'absence de valeur signifie « ne pas toucher à l'expiration ».
      durationDays: mode === 'create' ? LISTING_LIMITS.publicationDays : undefined,
      featurePlanCode: null,
    }),
    // Volontairement figé : ces valeurs ne servent qu'à l'initialisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const priceRequired = (type: PriceType | undefined) => type === 'fixed' || type === 'negotiable';

  const { values, errors, allErrors, isValid, completion, setValue, setValues, touch, touchAll } =
    useLiveValidation<FormState>({
      schema: listingFormSchema,
      initialValues: initialState,
      requiredFields: useMemo(() => {
        const fields: (keyof FormState)[] = ['title', 'description', 'categoryId', 'city'];
        return fields;
      }, []),
    });

  // Brouillon local : uniquement au dépôt, et sans les photos (déjà stockées).
  const {
    restored: draftValues,
    savedAt: draftSavedAt,
    clear: clearDraft,
  } = useDraft<FormState>(DRAFT_KEY, values, mode === 'create');
  const [draftDismissed, setDraftDismissed] = useState(false);

  const action = mode === 'create' ? createAdAction : updateAdAction;
  const [state, formAction, isPending] = useActionState<
    ActionResult<AdActionData> | null,
    FormData
  >(action, null);

  useEffect(() => {
    if (!state?.success) return;
    clearDraft();
    // En modification, on revient directement à l'annonce ; au dépôt, l'écran
    // de confirmation explique l'état obtenu (publiée, en revue, brouillon).
    if (mode === 'edit') router.push(state.data.href);
  }, [clearDraft, mode, router, state]);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.parent_id ? `— ${category.name}` : category.name,
      })),
    [categories],
  );

  /** Erreur affichée : celle du serveur d'abord, sinon la validation en direct. */
  const fieldError = (field: keyof FormState) =>
    (state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined) ?? errors[field];

  const needsPrice = priceRequired(values.priceType);
  const descriptionLength = (values.description ?? '').length;
  const showFeatureSection = featurePlans.length > 0 && !isFeatured;

  // ---------------------------------------------------------------- succès --
  if (state?.success && mode === 'create') {
    return (
      <div className="space-y-4">
        <Alert
          tone={state.data.status === 'pending_review' ? 'info' : 'success'}
          title={
            state.data.status === 'published'
              ? 'Votre annonce est en ligne'
              : state.data.status === 'pending_review'
                ? 'Votre annonce est en cours de vérification'
                : 'Votre brouillon est enregistré'
          }
        >
          {state.data.status === 'published'
            ? 'Elle est visible immédiatement par les acheteurs.'
            : state.data.status === 'pending_review'
              ? 'Un modérateur la relit avant publication — c’est généralement une affaire de quelques heures. Vous serez notifié dès qu’elle sera en ligne.'
              : 'Vous pourrez la publier depuis « Mes annonces » quand vous le souhaiterez.'}
        </Alert>

        {state.data.featurePending ? (
          <Alert tone="info" title="Mise en avant à régler">
            Votre demande de mise en avant est enregistrée. Elle prendra effet dès la confirmation
            du paiement Mobile Money.
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <ButtonLink href={state.data.href} size="lg">
            Voir mon annonce
          </ButtonLink>
          <ButtonLink href="/compte/annonces" variant="outline" size="lg">
            Mes annonces
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <input type="hidden" name="listingId" value={listingId} />

      {/* --------------------------- Brouillon local -------------------------- */}
      {mode === 'create' && draftValues && !draftDismissed ? (
        <Alert tone="info" title="Reprendre votre brouillon ?">
          <p className="mb-3">
            Une saisie non terminée a été retrouvée sur cet appareil
            {draftSavedAt ? ` (${formatRelativeDate(draftSavedAt)})` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setValues(draftValues);
                setDraftDismissed(true);
              }}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Restaurer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                clearDraft();
                setDraftDismissed(true);
              }}
            >
              Repartir de zéro
            </Button>
          </div>
        </Alert>
      ) : null}

      {/* ------------------------------ Photos ------------------------------ */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-brand-900">Photos</h2>
          <p className="text-sm text-neutral-600">
            Des photos nettes et lumineuses augmentent fortement vos chances de vendre. Jusqu’à{' '}
            {LISTING_LIMITS.maxImages} photos, la première sert de couverture.
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
          value={values.title ?? ''}
          onChange={(event) => setValue('title', event.target.value)}
          onBlur={() => touch('title')}
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
          value={values.categoryId ?? ''}
          onChange={(event) => setValue('categoryId', event.target.value)}
          onBlur={() => touch('categoryId')}
          error={fieldError('categoryId')}
        />

        <div>
          <Textarea
            name="description"
            label="Description"
            required
            rows={8}
            maxLength={LISTING_LIMITS.descriptionMax}
            value={values.description ?? ''}
            onChange={(event) => setValue('description', event.target.value)}
            onBlur={() => touch('description')}
            placeholder="Décrivez l’article : caractéristiques, état, raison de la vente, modalités de remise…"
            error={fieldError('description')}
          />
          <p className="mt-1 text-right text-xs text-neutral-400" aria-live="polite">
            {descriptionLength} / {LISTING_LIMITS.descriptionMax}
          </p>
        </div>

        <Select
          name="condition"
          label="État de l’article"
          options={CONDITION_OPTIONS}
          placeholder="Non précisé"
          value={values.condition ?? ''}
          onChange={(event) =>
            setValue('condition', (event.target.value || null) as AdCondition | null)
          }
          onBlur={() => touch('condition')}
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
            value={values.priceType ?? 'fixed'}
            onChange={(event) => {
              const next = event.target.value as PriceType;
              // Un prix résiduel n'aurait aucun sens sur « gratuit » ou « sur demande ».
              setValues(
                priceRequired(next) ? { priceType: next } : { priceType: next, price: null },
              );
            }}
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
            required={needsPrice}
            disabled={!needsPrice}
            value={values.price ?? ''}
            onChange={(event) => {
              const raw = event.target.value.trim();
              setValue('price', raw === '' ? null : Number(raw));
            }}
            onBlur={() => touch('price')}
            placeholder="0"
            prefix="FCFA"
            hint={needsPrice ? undefined : 'Non applicable pour cette modalité.'}
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
            value={values.city ?? ''}
            onChange={(event) => setValue('city', event.target.value)}
            onBlur={() => touch('city')}
            error={fieldError('city')}
          />

          <Input
            name="district"
            label="Quartier (facultatif)"
            maxLength={80}
            value={values.district ?? ''}
            onChange={(event) => setValue('district', event.target.value || null)}
            onBlur={() => touch('district')}
            placeholder="Ex. Nzeng-Ayong"
            error={fieldError('district')}
          />
        </div>

        <GeoLocationField
          latitude={values.latitude ?? null}
          longitude={values.longitude ?? null}
          onChange={(position) => {
            setValues(position);
            touch('latitude');
          }}
          error={fieldError('latitude')}
        />
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
            value={values.contactPhone ?? ''}
            onChange={(event) => setValue('contactPhone', event.target.value)}
            onBlur={() => touch('contactPhone')}
            placeholder="06 12 34 56"
            hint="Le numéro n’est révélé qu’après un clic de l’acheteur."
            error={fieldError('contactPhone')}
          />

          <Input
            name="contactWhatsapp"
            label="WhatsApp (facultatif)"
            type="tel"
            inputMode="tel"
            value={values.contactWhatsapp ?? ''}
            onChange={(event) => setValue('contactWhatsapp', event.target.value)}
            onBlur={() => touch('contactWhatsapp')}
            placeholder="06 12 34 56"
            error={fieldError('contactWhatsapp')}
          />
        </div>

        <Checkbox
          name="allowMessages"
          label="Autoriser les acheteurs à me contacter par la messagerie du site"
          checked={values.allowMessages ?? true}
          onChange={(event) => setValue('allowMessages', event.target.checked)}
        />
      </section>

      {/* ------------------------------ Diffusion ----------------------------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-900">Diffusion</h2>

        <Select
          name="durationDays"
          label="Durée de publication"
          options={DURATION_OPTIONS}
          placeholder={mode === 'edit' ? 'Ne pas modifier' : undefined}
          value={values.durationDays === undefined ? '' : String(values.durationDays)}
          onChange={(event) =>
            setValue('durationDays', event.target.value ? Number(event.target.value) : undefined)
          }
          hint="Passé ce délai, l’annonce est archivée automatiquement. Vous pouvez la remettre en ligne à tout moment."
          error={fieldError('durationDays')}
          className="sm:max-w-xs"
        />

        {showFeatureSection ? (
          <fieldset className="space-y-3">
            <legend className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              <Sparkles className="size-4 text-gold-600" aria-hidden="true" />
              Annonce sponsorisée (facultatif)
            </legend>

            <div className="grid gap-2 sm:grid-cols-2">
              <FeatureOption
                code=""
                name="Publication simple"
                description="Votre annonce paraît normalement dans les résultats."
                price={0}
                checked={!values.featurePlanCode}
                onSelect={() => setValue('featurePlanCode', null)}
              />
              {featurePlans.map((plan) => (
                <FeatureOption
                  key={plan.id}
                  code={plan.code}
                  name={plan.name}
                  description={
                    plan.description ?? `Mise en avant pendant ${plan.duration_days} jours.`
                  }
                  price={plan.price}
                  checked={values.featurePlanCode === plan.code}
                  onSelect={() => setValue('featurePlanCode', plan.code)}
                />
              ))}
            </div>

            <p className="text-xs text-neutral-500">
              Le paiement s’effectue par Mobile Money après le dépôt. La mise en avant démarre à la
              confirmation du paiement — jamais avant.
            </p>
          </fieldset>
        ) : null}
      </section>

      {/* ----------------------- Validation automatique ----------------------- */}
      <section
        className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
        aria-labelledby="validation-title"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2
            id="validation-title"
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800"
          >
            {isValid ? (
              <CheckCircle2 className="size-4.5 text-brand-700" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-4.5 text-gold-600" aria-hidden="true" />
            )}
            Validation automatique
          </h2>
          <span className="text-sm font-semibold text-neutral-600" aria-hidden="true">
            {completion}&nbsp;%
          </span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-neutral-200"
          role="progressbar"
          aria-valuenow={completion}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du formulaire"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${completion}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-neutral-600" aria-live="polite">
          {isValid
            ? 'Tout est en ordre. Un contrôle de contenu est appliqué à la publication : une annonce signalée passe en vérification manuelle plutôt que d’être refusée.'
            : `${Object.keys(allErrors).length} point${Object.keys(allErrors).length > 1 ? 's' : ''} à corriger avant publication.`}
        </p>
      </section>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      {/* La mention du brouillon garde sa propre ligne : le formulaire est
          contraint à `max-w-3xl`, où elle ne tiendrait jamais à côté des deux
          boutons sans déborder. */}
      <div className="sticky bottom-16 -mx-4 flex flex-col gap-2 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur sm:mx-0 sm:rounded-b-xl md:bottom-0">
        {mode === 'create' ? (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            Brouillon enregistré sur cet appareil.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {mode === 'create' ? (
            <Button
              type="submit"
              name="publish"
              value="false"
              variant="outline"
              size="lg"
              disabled={isPending}
              onClick={touchAll}
            >
              Enregistrer comme brouillon
            </Button>
          ) : null}

          <Button type="submit" size="lg" isLoading={isPending} onClick={touchAll}>
            {mode === 'create' ? 'Publier mon annonce' : 'Enregistrer les modifications'}
          </Button>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        {images.length} photo{images.length > 1 ? 's' : ''} sélectionnée
        {images.length > 1 ? 's' : ''}. En publiant, vous acceptez les{' '}
        <Link href="/conditions" className="text-brand-700 underline underline-offset-2">
          conditions d’utilisation
        </Link>
        .
      </p>
    </form>
  );
}

interface FeatureOptionProps {
  code: string;
  name: string;
  description: string;
  price: number;
  checked: boolean;
  onSelect: () => void;
}

/** Carte-radio d'une offre de mise en avant. Le tarif affiché est indicatif :
 *  celui qui fait foi est relu en base par `request_ad_feature()`. */
function FeatureOption({ code, name, description, price, checked, onSelect }: FeatureOptionProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        checked ? 'border-gold-500 bg-gold-50' : 'border-neutral-200 bg-white hover:bg-neutral-50'
      }`}
    >
      <input
        type="radio"
        name="featurePlanCode"
        value={code}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 border-neutral-300 text-gold-600 focus:ring-2 focus:ring-gold-500/40"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-neutral-900">{name}</span>
          <span className="text-sm font-bold text-brand-800">
            {price > 0 ? formatPrice(price) : 'Gratuit'}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-neutral-600">{description}</span>
      </span>
    </label>
  );
}
