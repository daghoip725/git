'use client';

/**
 * Aides à la rédaction, sous le champ de description.
 *
 * Trois boutons, dont un seul dépend d'un modèle de langage :
 *
 *  - **Mettre en forme** : purement local, toujours disponible. Capitales
 *    criées, ponctuation répétée, espacement français, séparateurs de milliers.
 *  - **Corriger les fautes** : met en forme puis, si un assistant est
 *    configuré, corrige l'orthographe.
 *  - **Rédiger pour moi** : proposé seulement si un assistant est configuré.
 *
 * Rien n'est appliqué sans geste du vendeur : la proposition s'affiche à côté
 * du texte actuel, avec « Remplacer » et « Garder mon texte ». Écraser
 * silencieusement ce qu'il a écrit serait le meilleur moyen de lui faire perdre
 * confiance dans le formulaire.
 */
import { Check, Sparkles, SpellCheck, WandSparkles, X } from 'lucide-react';
import { useState, useTransition } from 'react';

import {
  proofreadAction,
  tidyTextAction,
  writeDescriptionAction,
} from '@/app/actions/ai.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export interface WritingAssistProps {
  /** `false` quand aucune clé n'est configurée : les deux boutons IA disparaissent. */
  assistantAvailable: boolean;
  title: string;
  description: string;
  categoryName: string | null;
  city: string;
  condition: string | null;
  price: number | null;
  onApply: (nextTitle: string | null, nextDescription: string) => void;
}

export function WritingAssist({
  assistantAvailable,
  title,
  description,
  categoryName,
  city,
  condition,
  price,
  onApply,
}: WritingAssistProps) {
  const [proposal, setProposal] = useState<string | null>(null);
  const [tidiedTitle, setTidiedTitle] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setProposal(null);
    setTidiedTitle(null);
    setError(null);
    setNotice(null);
  }

  function runTidy() {
    reset();
    startTransition(async () => {
      const result = await tidyTextAction(title, description);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (!result.data.changed) {
        setNotice('Votre texte est déjà bien mis en forme.');
        return;
      }
      setTidiedTitle(result.data.title !== title ? result.data.title : null);
      setProposal(result.data.description);
    });
  }

  function runProofread() {
    reset();
    startTransition(async () => {
      const result = await proofreadAction(description);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data === description) {
        setNotice('Aucune correction à apporter.');
        return;
      }
      setProposal(result.data);
    });
  }

  function runWrite() {
    reset();
    startTransition(async () => {
      const result = await writeDescriptionAction({
        title,
        categoryName: categoryName ?? '',
        city,
        condition: condition ?? undefined,
        price: price ?? undefined,
        // Ce que le vendeur a déjà tapé sert de matière : on ne part pas de rien
        // s'il a noté trois points en style télégraphique.
        notes: description.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setProposal(result.data);
    });
  }

  const canWrite = assistantAvailable && title.trim().length >= 5 && city !== '' && categoryName;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={runTidy}
          disabled={isPending || description.trim() === ''}
        >
          <WandSparkles className="size-4" aria-hidden="true" />
          Mettre en forme
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={runProofread}
          disabled={isPending || description.trim().length < 20}
        >
          <SpellCheck className="size-4" aria-hidden="true" />
          Corriger les fautes
        </Button>

        {assistantAvailable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={runWrite}
            disabled={isPending || !canWrite}
            title={
              canWrite
                ? undefined
                : 'Renseignez le titre, la catégorie et la ville pour utiliser la rédaction assistée.'
            }
          >
            <Sparkles className="size-4 text-gold-600" aria-hidden="true" />
            Rédiger pour moi
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {proposal !== null ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-semibold text-brand-900">Proposition</p>
          {tidiedTitle ? (
            <p className="mt-1 text-xs text-brand-800">
              Titre proposé : <strong>{tidiedTitle}</strong>
            </p>
          ) : null}
          <p className="mt-1.5 max-h-48 overflow-y-auto text-sm whitespace-pre-wrap text-neutral-800">
            {proposal}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(tidiedTitle, proposal);
                reset();
              }}
            >
              <Check className="size-4" aria-hidden="true" />
              Remplacer mon texte
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              <X className="size-4" aria-hidden="true" />
              Garder mon texte
            </Button>
          </div>

          {assistantAvailable ? (
            <p className="mt-2 text-xs text-brand-800">
              Suggestion générée automatiquement : relisez-la, elle n’engage que vous.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
