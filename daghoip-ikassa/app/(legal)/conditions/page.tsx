import type { Metadata } from 'next';

import { SITE } from '@/utils/constants';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: `Conditions générales d’utilisation de la plateforme ${SITE.name}.`,
};

export default function TermsPage() {
  return (
    <>
      <h1>Conditions générales d’utilisation</h1>
      <p className="text-sm text-neutral-500">
        Modèle à faire valider par un conseil juridique avant mise en production.
      </p>

      <h2>1. Objet</h2>
      <p>
        {SITE.name} est une plateforme de petites annonces qui met en relation des vendeurs et des
        acheteurs situés au Gabon. La plateforme n’est ni vendeur, ni acheteur, ni intermédiaire de
        paiement : elle n’intervient à aucun moment dans la transaction, la livraison ou le
        règlement entre utilisateurs.
      </p>

      <h2>2. Inscription et compte</h2>
      <p>
        La création d’un compte est gratuite et requiert une adresse e-mail valide. Vous êtes
        responsable de la confidentialité de vos identifiants et de toute activité réalisée depuis
        votre compte. Vous vous engagez à fournir des informations exactes et à les tenir à jour.
      </p>

      <h2>3. Publication des annonces</h2>
      <p>
        En publiant une annonce, vous garantissez que vous êtes en droit de vendre l’article ou de
        proposer le service concerné, et que la description ainsi que les photos sont sincères. Il
        est notamment interdit de publier des annonces portant sur :
      </p>
      <ul>
        <li>des produits illicites, contrefaits ou volés ;</li>
        <li>des armes, munitions, explosifs ou stupéfiants ;</li>
        <li>des espèces protégées, ivoire, écailles ou tout produit issu du braconnage ;</li>
        <li>des médicaments, documents administratifs ou diplômes ;</li>
        <li>des contenus à caractère pornographique, haineux ou discriminatoire ;</li>
        <li>des offres financières frauduleuses ou des systèmes pyramidaux.</li>
      </ul>
      <p>
        Toute annonce contraire à ces règles peut être retirée sans préavis et le compte associé
        suspendu.
      </p>

      <h2>4. Durée de publication</h2>
      <p>
        Une annonce publiée reste visible 60 jours. Passé ce délai, elle expire automatiquement et
        peut être remise en ligne depuis votre espace personnel.
      </p>

      <h2>5. Responsabilité</h2>
      <p>
        {SITE.name} ne saurait être tenue responsable des litiges, dommages ou pertes résultant
        d’une transaction entre utilisateurs. Nous vous invitons à consulter nos{' '}
        <a href="/securite">conseils de sécurité</a> avant toute transaction.
      </p>

      <h2>6. Modération</h2>
      <p>
        Nous nous réservons le droit de modérer, modifier ou supprimer tout contenu contraire aux
        présentes conditions, à la législation gabonaise en vigueur ou aux bonnes mœurs.
      </p>

      <h2>7. Modification des conditions</h2>
      <p>
        Ces conditions peuvent évoluer. Les utilisateurs sont informés de toute modification
        substantielle par une notification sur le site.
      </p>

      <h2>8. Contact</h2>
      <p>
        Pour toute question relative aux présentes conditions :{' '}
        <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
      </p>
    </>
  );
}
