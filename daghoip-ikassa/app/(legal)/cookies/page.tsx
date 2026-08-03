import type { Metadata } from 'next';

import { SITE } from '@/utils/constants';

export const metadata: Metadata = {
  title: 'Gestion des cookies',
  description: `Les cookies utilisés par ${SITE.name} et leur finalité.`,
};

export default function CookiesPage() {
  return (
    <>
      <h1>Gestion des cookies</h1>

      <h2>Cookies strictement nécessaires</h2>
      <p>
        {SITE.name} n’utilise que des cookies indispensables au fonctionnement du service. Ils ne
        servent ni au profilage publicitaire, ni au suivi inter-sites.
      </p>
      <ul>
        <li>
          <strong>Cookies de session</strong> : maintiennent votre connexion entre deux pages et
          permettent le rafraîchissement automatique de votre jeton d’authentification. Ils sont
          déposés uniquement après connexion.
        </li>
      </ul>

      <h2>Aucun cookie publicitaire</h2>
      <p>
        Nous n’intégrons ni régie publicitaire, ni pixel de réseau social, ni outil d’analyse tiers.
        Aucun consentement préalable n’est donc requis pour naviguer sur le site.
      </p>

      <h2>Supprimer les cookies</h2>
      <p>
        Vous pouvez effacer les cookies depuis les paramètres de votre navigateur. La suppression
        des cookies de session entraîne simplement votre déconnexion.
      </p>
    </>
  );
}
