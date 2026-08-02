import { CategoryManager } from '@/components/admin/CategoryManager';
import { Alert } from '@/components/ui/Alert';
import { requireRole } from '@/lib/auth/roles';
import { getAllCategories } from '@/services/categories.service';

export default async function AdminCategoriesPage() {
  await requireRole('moderator');

  // `getCategories()` ne renvoie que les catégories actives : l'administration
  // doit voir aussi celles qu'elle a désactivées.
  const categories = await getAllCategories();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-brand-900">Catégories</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Deux niveaux : des catégories racines et leurs sous-catégories. Le nombre d’annonces est
          un compteur maintenu par trigger, jamais recalculé à l’affichage.
        </p>
      </div>

      <CategoryManager categories={categories} />

      <Alert tone="info" title="Désactiver plutôt que supprimer">
        Une catégorie désactivée disparaît de la navigation et du dépôt d’annonce, mais les annonces
        qu’elle contient restent en ligne et gardent leur adresse. La suppression, elle, est refusée
        par la base tant qu’une annonce y est rattachée.
      </Alert>
    </div>
  );
}
