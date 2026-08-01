'use client';

/**
 * Validation automatique d'un formulaire, à la saisie.
 *
 * Le schéma Zod utilisé ici est **exactement celui du serveur**
 * (`utils/validation.ts`) : une seule source de vérité pour les règles. Ce
 * hook ne fait que donner un retour immédiat à l'utilisateur — la Server
 * Action revalide tout, et PostgreSQL a le dernier mot.
 *
 * Un champ n'affiche son erreur qu'une fois « touché » (quitté après saisie) :
 * afficher « le titre est obligatoire » sur un formulaire vierge est
 * décourageant plutôt qu'utile.
 */
import { useCallback, useMemo, useState } from 'react';
import type { z } from 'zod';

export interface UseLiveValidationOptions<T> {
  /** Schéma Zod appliqué à l'ensemble des valeurs. */
  schema: z.ZodType<unknown, T>;
  initialValues: T;
  /** Champs à considérer pour la barre de progression. */
  requiredFields?: (keyof T)[];
}

export interface UseLiveValidationResult<T> {
  values: T;
  /** Erreurs des seuls champs déjà touchés. */
  errors: Partial<Record<keyof T, string>>;
  /** Toutes les erreurs, touchées ou non (utile à la soumission). */
  allErrors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
  /** Progression de remplissage, de 0 à 100. */
  completion: number;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (patch: Partial<T>) => void;
  touch: (field: keyof T) => void;
  /** Marque tous les champs comme touchés : à appeler avant de soumettre. */
  touchAll: () => void;
  reset: (values: T) => void;
}

export function useLiveValidation<T extends Record<string, unknown>>({
  schema,
  initialValues,
  requiredFields = [],
}: UseLiveValidationOptions<T>): UseLiveValidationResult<T> {
  const [values, setValuesState] = useState<T>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  /** Erreurs recalculées à chaque changement de valeur. */
  const allErrors = useMemo(() => {
    const result = schema.safeParse(values);
    if (result.success) return {} as Partial<Record<keyof T, string>>;

    const map: Partial<Record<keyof T, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof T | undefined;
      // Première erreur par champ : en empiler plusieurs n'aide personne.
      if (key !== undefined && map[key] === undefined) map[key] = issue.message;
    }
    return map;
  }, [schema, values]);

  const errors = useMemo(() => {
    const visible: Partial<Record<keyof T, string>> = {};
    for (const key of Object.keys(allErrors) as (keyof T)[]) {
      if (touched[key]) visible[key] = allErrors[key];
    }
    return visible;
  }, [allErrors, touched]);

  const isValid = Object.keys(allErrors).length === 0;

  const completion = useMemo(() => {
    if (requiredFields.length === 0) return isValid ? 100 : 0;

    const filled = requiredFields.filter((field) => {
      const value = values[field];
      if (value === null || value === undefined || value === '') return false;
      return allErrors[field] === undefined;
    }).length;

    return Math.round((filled / requiredFields.length) * 100);
  }, [allErrors, isValid, requiredFields, values]);

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValuesState((current) => ({ ...current, [field]: value }));
  }, []);

  const setValues = useCallback((patch: Partial<T>) => {
    setValuesState((current) => ({ ...current, ...patch }));
  }, []);

  const touch = useCallback((field: keyof T) => {
    setTouched((current) => ({ ...current, [field]: true }));
  }, []);

  const touchAll = useCallback(() => {
    setTouched(() => {
      const all: Partial<Record<keyof T, boolean>> = {};
      for (const key of Object.keys(values) as (keyof T)[]) all[key] = true;
      return all;
    });
  }, [values]);

  const reset = useCallback((next: T) => {
    setValuesState(next);
    setTouched({});
  }, []);

  return {
    values,
    errors,
    allErrors,
    touched,
    isValid,
    completion,
    setValue,
    setValues,
    touch,
    touchAll,
    reset,
  };
}
