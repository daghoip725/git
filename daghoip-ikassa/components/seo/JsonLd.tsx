/**
 * Injection de données structurées Schema.org.
 *
 * Un seul point d'entrée pour tout le site : la sérialisation et l'échappement
 * y sont traités une fois, plutôt que réécrits à chaque page — c'est le genre
 * de duplication où l'un des exemplaires finit par oublier l'échappement.
 *
 * `</script>` est neutralisé dans la sortie JSON. Les données viennent de la
 * base et peuvent contenir du texte rédigé par un utilisateur : sans cette
 * précaution, un titre d'annonce contenant `</script>` fermerait la balise et
 * ferait passer la suite pour du HTML.
 */
export interface JsonLdProps {
  /** Objet Schema.org, ou tableau d'objets pour un graphe. */
  data: Record<string, unknown> | Record<string, unknown>[];
}

export function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** Fiche de l'organisation, réutilisée par plusieurs pages. */
export function organizationSchema(siteUrl: string, name: string, logo: string) {
  return {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organisation`,
    name,
    url: siteUrl,
    logo: { '@type': 'ImageObject', url: `${siteUrl}${logo}` },
    areaServed: { '@type': 'Country', name: 'Gabon' },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'service client',
      availableLanguage: ['fr'],
      areaServed: 'GA',
    },
  };
}

/**
 * Fil d'Ariane structuré.
 *
 * À garder **synchronisé avec le fil d'Ariane visible** : Google pénalise les
 * données structurées qui décrivent autre chose que ce que voit le visiteur.
 */
export function breadcrumbSchema(siteUrl: string, items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}
