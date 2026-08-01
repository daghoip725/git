'use client';

/**
 * Demande de badge « vendeur vérifié ».
 *
 * Les pièces partent **directement** du navigateur vers le bucket privé
 * `verification-docs`, dans le dossier de l'utilisateur. Ni le serveur Next.js
 * ni cette action ne manipulent les octets : seuls les chemins circulent. La
 * politique Storage empêche d'écrire ailleurs que dans son propre dossier, et
 * la RPC `request_verification()` le revérifie.
 */
import { FileCheck2, Loader2, Upload } from 'lucide-react';
import { useActionState, useRef, useState, type ChangeEvent } from 'react';

import { requestVerificationAction } from '@/app/actions/verification.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';
import type { ActionResult } from '@/types';
import { cn } from '@/utils/cn';
import { VERIFICATION_DOCS_BUCKET } from '@/utils/constants';

const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export interface VerificationFormProps {
  userId: string;
  defaultFullName: string;
  defaultPhone: string | null;
}

/** Champ de téléversement d'une pièce justificative. */
function DocumentField({
  id,
  label,
  hint,
  required,
  userId,
  onUploaded,
}: {
  id: string;
  label: string;
  hint: string;
  required?: boolean;
  userId: string;
  onUploaded: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('Format non supporté (JPEG, PNG ou PDF).');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Fichier trop lourd (10 Mo maximum).');
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      // Convention imposée par la politique Storage : `<user_id>/<uuid>.<ext>`.
      const path = `${userId}/${crypto.randomUUID()}.${EXTENSIONS[file.type] ?? 'pdf'}`;

      const { error: uploadError } = await supabase.storage
        .from(VERIFICATION_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError('L’envoi a échoué. Veuillez réessayer.');
        onUploaded(null);
      } else {
        setFileName(file.name);
        onUploaded(path);
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-neutral-800">
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className={cn(
          'flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-sm font-medium transition-colors',
          fileName
            ? 'border-brand-300 bg-brand-50 text-brand-800'
            : 'border-neutral-300 text-neutral-600 hover:border-brand-500 hover:text-brand-700',
          isUploading && 'opacity-60',
        )}
      >
        {isUploading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : fileName ? (
          <FileCheck2 className="size-4" aria-hidden="true" />
        ) : (
          <Upload className="size-4" aria-hidden="true" />
        )}
        <span className="truncate">
          {isUploading ? 'Envoi…' : (fileName ?? 'Choisir un fichier')}
        </span>
      </button>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={handleChange}
        className="sr-only"
        aria-label={label}
      />

      <p className="text-xs text-neutral-500">{hint}</p>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function VerificationForm({ userId, defaultFullName, defaultPhone }: VerificationFormProps) {
  const [idPath, setIdPath] = useState<string | null>(null);
  const [businessPath, setBusinessPath] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    requestVerificationAction,
    null,
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  if (state?.success) {
    return (
      <Alert tone="success" title="Demande envoyée">
        Notre équipe examine votre dossier sous 48 heures ouvrées. Vous recevrez une notification
        dès qu’une décision sera prise.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Chemins des pièces déjà téléversées. */}
      {idPath ? <input type="hidden" name="idDocumentPath" value={idPath} /> : null}
      {businessPath ? (
        <input type="hidden" name="businessDocumentPath" value={businessPath} />
      ) : null}

      <Input
        name="fullLegalName"
        label="Nom complet"
        required
        defaultValue={defaultFullName}
        hint="Exactement tel qu’il figure sur votre pièce d’identité."
        error={fieldError('fullLegalName')}
      />

      <Input
        name="contactPhone"
        type="tel"
        inputMode="tel"
        label="Téléphone joignable"
        required
        defaultValue={defaultPhone ?? ''}
        placeholder="06 12 34 56"
        error={fieldError('contactPhone')}
      />

      <DocumentField
        id="id-document"
        label="Pièce d’identité"
        hint="CNI, passeport ou carte de séjour. JPEG, PNG ou PDF, 10 Mo maximum."
        required
        userId={userId}
        onUploaded={setIdPath}
      />

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm font-semibold text-brand-900">Vous êtes une entreprise ?</p>
        <p className="mt-0.5 mb-4 text-xs text-neutral-600">
          Facultatif. Renseigné, votre nom commercial s’affichera sur vos annonces.
        </p>

        <div className="space-y-4">
          <Input
            name="businessName"
            label="Nom commercial"
            maxLength={120}
            placeholder="Ex. Boutique Mbadinga"
            error={fieldError('businessName')}
          />
          <Input
            name="businessIdNumber"
            label="Numéro RCCM ou NIF"
            maxLength={60}
            placeholder="RCCM-LBV-2024-B-1234"
            error={fieldError('businessIdNumber')}
          />
          <DocumentField
            id="business-document"
            label="Document d’entreprise"
            hint="Registre de commerce, statuts ou attestation fiscale."
            userId={userId}
            onUploaded={setBusinessPath}
          />
        </div>
      </div>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Alert tone="info" title="Vos documents restent confidentiels">
        Ils sont stockés dans un espace privé, accessibles uniquement à notre équipe de
        vérification, et ne sont jamais affichés publiquement.
      </Alert>

      <Button type="submit" size="lg" fullWidth isLoading={isPending} disabled={!idPath}>
        Envoyer ma demande
      </Button>

      {!idPath ? (
        <p className="text-center text-xs text-neutral-500">
          Ajoutez votre pièce d’identité pour activer l’envoi.
        </p>
      ) : null}
    </form>
  );
}
