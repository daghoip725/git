'use client';

/**
 * Gestion des catégories : création, modification, activation, suppression.
 *
 * L'arborescence n'a qu'un niveau (une racine, ses enfants), ce qui suffit à un
 * site d'annonces et évite l'écueil d'un arbre profond que personne ne parcourt.
 * Le formulaire est unique, réutilisé en création comme en modification.
 */
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { deleteCategoryAction, saveCategoryAction } from '@/app/actions/catalog.actions';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { ActionResult, Category } from '@/types';

export interface CategoryManagerProps {
  categories: Category[];
}

export function CategoryManager({ categories }: CategoryManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);

  const roots = categories.filter((category) => category.parent_id === null);
  const childrenOf = (parentId: string) =>
    categories.filter((category) => category.parent_id === parentId);

  const isFormOpen = isCreating || editing !== null;

  function closeForm() {
    setIsCreating(false);
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600" role="status">
          {categories.length} catégorie{categories.length > 1 ? 's' : ''} · {roots.length} racine
          {roots.length > 1 ? 's' : ''}
        </p>
        <Button type="button" onClick={() => setIsCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvelle catégorie
        </Button>
      </div>

      <ul className="space-y-2">
        {roots.map((root) => (
          <li key={root.id} className="rounded-xl border border-neutral-200 bg-card p-3">
            <CategoryLine
              category={root}
              onEdit={() => setEditing(root)}
              onDelete={() => setDeleting(root)}
            />

            {childrenOf(root.id).length > 0 ? (
              <ul className="mt-2 space-y-1 border-l-2 border-neutral-100 pl-4">
                {childrenOf(root.id).map((child) => (
                  <li key={child.id} className="py-1">
                    <CategoryLine
                      category={child}
                      onEdit={() => setEditing(child)}
                      onDelete={() => setDeleting(child)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {isFormOpen ? (
        <CategoryForm
          category={editing}
          roots={roots}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            router.refresh();
          }}
        />
      ) : null}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Supprimer « ${deleting?.name ?? ''} » ?`}
        description="La suppression échoue si des annonces ou des sous-catégories y sont rattachées — une catégorie ne doit pas emporter ce qu’elle contient. Dans ce cas, désactivez-la."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isDeletePending}
              onClick={async () => {
                if (!deleting) return;
                setIsDeletePending(true);
                setDeleteError(null);
                const result = await deleteCategoryAction(deleting.id);
                setIsDeletePending(false);
                if (result.success) {
                  setDeleting(null);
                  router.refresh();
                } else {
                  setDeleteError(result.error);
                }
              }}
            >
              Supprimer
            </Button>
          </>
        }
      >
        {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface CategoryLineProps {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
}

function CategoryLine({ category, onEdit, onDelete }: CategoryLineProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-semibold text-brand-900">{category.name}</span>
        <code className="text-xs text-neutral-500">/{category.slug}</code>
        <Badge tone="neutral">{category.ads_count} annonces</Badge>
        {!category.is_active ? <Badge tone="danger">Désactivée</Badge> : null}
      </div>

      <div className="flex gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          Modifier
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Supprimer {category.name}</span>
        </Button>
      </div>
    </div>
  );
}

interface CategoryFormProps {
  category: Category | null;
  roots: Category[];
  onClose: () => void;
  onSaved: () => void;
}

function CategoryForm({ category, roots, onClose, onSaved }: CategoryFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    saveCategoryAction,
    null,
  );

  useEffect(() => {
    if (state?.success) onSaved();
  }, [onSaved, state]);

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-brand-900">
          {category ? `Modifier « ${category.name} »` : 'Nouvelle catégorie'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le formulaire"
          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="name"
          label="Nom"
          required
          maxLength={60}
          defaultValue={category?.name}
          error={fieldError('name')}
        />
        <Input
          name="slug"
          label="Raccourci (URL)"
          required
          maxLength={60}
          defaultValue={category?.slug}
          placeholder="vehicules"
          hint="Minuscules, chiffres et tirets uniquement."
          error={fieldError('slug')}
        />
        <Select
          name="parentId"
          label="Catégorie parente"
          placeholder="Aucune (catégorie racine)"
          options={roots
            .filter((root) => root.id !== category?.id)
            .map((root) => ({ value: root.id, label: root.name }))}
          defaultValue={category?.parent_id ?? ''}
          error={fieldError('parentId')}
        />
        <Input
          name="position"
          label="Position"
          type="number"
          min={0}
          max={999}
          defaultValue={category?.position ?? 0}
          hint="Plus le nombre est petit, plus la catégorie apparaît tôt."
          error={fieldError('position')}
        />
      </div>

      <Input
        name="icon"
        label="Icône (facultatif)"
        maxLength={40}
        defaultValue={category?.icon ?? ''}
        placeholder="car"
        hint="Nom d’une icône Lucide."
        error={fieldError('icon')}
      />

      <Checkbox
        name="isActive"
        label="Catégorie active (visible des visiteurs)"
        defaultChecked={category?.is_active ?? true}
      />

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" isLoading={isPending}>
          {category ? 'Enregistrer' : 'Créer la catégorie'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
