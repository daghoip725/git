import type { Metadata } from 'next';

import { SITE } from '@/utils/constants';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: `Comment ${SITE.name} collecte, utilise et protège vos données personnelles.`,
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p className="text-sm text-neutral-500">
        Modèle à faire valider par un conseil juridique avant mise en production.
      </p>

      <h2>1. Données collectées</h2>
      <ul>
        <li>
          <strong>Compte</strong> : nom complet, adresse e-mail, mot de passe (stocké sous forme
          chiffrée par notre fournisseur d’authentification), téléphone et ville si vous les
          renseignez.
        </li>
        <li>
          <strong>Annonces</strong> : titre, description, photos, prix, localisation et coordonnées
          de contact que vous choisissez de publier.
        </li>
        <li>
          <strong>Usage</strong> : nombre de vues d’une annonce, favoris, messages échangés via la
          messagerie interne.
        </li>
        <li>
          <strong>Technique</strong> : adresse IP et journaux de sécurité, conservés à des fins de
          prévention des abus.
        </li>
      </ul>

      <h2>2. Finalités</h2>
      <p>
        Vos données servent exclusivement à faire fonctionner le service : afficher vos annonces,
        vous permettre d’être contacté par des acheteurs, sécuriser votre compte et lutter contre la
        fraude. Nous ne vendons aucune donnée personnelle.
      </p>

      <h2>3. Visibilité publique</h2>
      <p>
        Le nom, la ville et les annonces d’un vendeur sont visibles publiquement. Le numéro de
        téléphone renseigné dans une annonce n’est affiché qu’après une action explicite de
        l’acheteur. Le téléphone enregistré dans votre profil n’est jamais exposé publiquement.
      </p>

      <h2>4. Conservation</h2>
      <p>
        Vos données sont conservées tant que votre compte est actif. À la suppression du compte, vos
        annonces et vos photos sont effacées ; certaines données peuvent être conservées le temps
        requis par la loi ou pour la prévention de la fraude.
      </p>

      <h2>5. Sécurité</h2>
      <p>
        Les échanges sont chiffrés (HTTPS). L’accès aux données est contrôlé au niveau de la base
        par des règles d’autorisation par ligne (Row Level Security) : un utilisateur ne peut
        techniquement accéder qu’à ses propres données.
      </p>

      <h2>6. Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les rectifier depuis votre espace personnel, ou demander
        la suppression de votre compte en écrivant à{' '}
        <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
      </p>

      <h2>7. Sous-traitants</h2>
      <p>
        Nous utilisons un hébergeur d’application et un fournisseur de base de données et
        d’authentification (Supabase). Ces prestataires n’accèdent aux données que pour fournir le
        service.
      </p>
    </>
  );
}
