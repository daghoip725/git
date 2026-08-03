/**
 * Catalogue de traduction.
 *
 * Un objet TypeScript, pas un fichier JSON chargé à l'exécution ni une
 * bibliothèque d'internationalisation. Trois raisons, dans cet ordre :
 *
 *  1. **Le typage attrape les oublis.** `Dictionary` est déduit du catalogue
 *     français ; toute clé manquante en anglais fait échouer `tsc`. Aucune
 *     bibliothèque ne donne cette garantie sans configuration supplémentaire,
 *     et c'est précisément l'erreur la plus fréquente d'une traduction — la
 *     clé qu'on oublie et qui s'affiche telle quelle en production.
 *  2. **Rien à télécharger.** Sur une connexion mobile gabonaise, un
 *     chargement de catalogue à l'exécution coûte plus qu'il ne rapporte.
 *  3. **Zéro dépendance ajoutée**, conformément au reste du projet.
 *
 * ## Portée
 *
 * Ce catalogue couvre le **chrome** — navigation, pied de page, espace
 * personnel, paramètres. Le contenu écrit par les gens (annonces, messages,
 * quartiers) n'est jamais traduit : voir `lib/i18n/config.ts` pour le
 * raisonnement.
 */
import type { Locale } from '@/lib/i18n/config';

const fr = {
  nav: {
    home: 'Accueil',
    listings: 'Annonces',
    categories: 'Catégories',
    postAd: 'Déposer une annonce',
    account: 'Mon compte',
    messages: 'Messages',
    signIn: 'Se connecter',
    signOut: 'Se déconnecter',
    skipToContent: 'Aller au contenu principal',
  },
  account: {
    dashboard: 'Tableau de bord',
    myAds: 'Mes annonces',
    favorites: 'Mes favoris',
    history: 'Mon historique',
    profile: 'Mon profil',
    payments: 'Paiements',
    notifications: 'Notifications',
    verification: 'Vérification',
    blocked: 'Comptes bloqués',
    password: 'Mot de passe',
    settings: 'Paramètres',
    navLabel: 'Navigation du compte',
  },
  settings: {
    title: 'Paramètres',
    subtitle: 'Langue, sécurité et suppression du compte.',

    languageTitle: 'Langue de l’interface',
    languageHelp:
      'Change les menus, les formulaires et les messages de l’application. Les annonces et les messages restent tels qu’ils ont été écrits par leurs auteurs.',
    languageSave: 'Enregistrer la langue',
    languageSaved: 'Langue enregistrée.',
    languageError: 'Impossible d’enregistrer la langue.',

    securityTitle: 'Sécurité',
    passwordLink: 'Changer mon mot de passe',
    passwordLinkHelp: 'Le mot de passe actuel vous sera demandé.',
    notificationsLink: 'Régler mes notifications',
    notificationsLinkHelp: 'Choisissez ce qui vous arrive par courriel, et à quel rythme.',

    dangerTitle: 'Supprimer mon compte',
    dangerLead: 'Cette action est définitive. Elle ne peut pas être annulée.',
    dangerRemoved: 'Ce qui est supprimé',
    dangerKept: 'Ce qui est conservé',
    dangerConfirmLabel: 'Pour confirmer, saisissez',
    dangerSubmit: 'Supprimer définitivement mon compte',
    dangerCancel: 'Annuler',
    dangerError: 'Impossible de supprimer le compte.',
  },
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    loading: 'Chargement…',
  },
} as const;

/**
 * Forme du catalogue, déduite du français.
 *
 * Le français fait référence parce qu'il est la langue d'origine du produit :
 * c'est là que les libellés naissent, et c'est donc lui qui doit dicter la
 * liste des clés.
 */
export type Dictionary = {
  [Section in keyof typeof fr]: { [Key in keyof (typeof fr)[Section]]: string };
};

const en: Dictionary = {
  nav: {
    home: 'Home',
    listings: 'Listings',
    categories: 'Categories',
    postAd: 'Post an ad',
    account: 'My account',
    messages: 'Messages',
    signIn: 'Sign in',
    signOut: 'Sign out',
    skipToContent: 'Skip to main content',
  },
  account: {
    dashboard: 'Dashboard',
    myAds: 'My ads',
    favorites: 'My favourites',
    history: 'My history',
    profile: 'My profile',
    payments: 'Payments',
    notifications: 'Notifications',
    verification: 'Verification',
    blocked: 'Blocked accounts',
    password: 'Password',
    settings: 'Settings',
    navLabel: 'Account navigation',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Language, security and account deletion.',

    languageTitle: 'Interface language',
    languageHelp:
      'Changes the menus, forms and messages of the application. Listings and messages stay exactly as their authors wrote them.',
    languageSave: 'Save language',
    languageSaved: 'Language saved.',
    languageError: 'Could not save the language.',

    securityTitle: 'Security',
    passwordLink: 'Change my password',
    passwordLinkHelp: 'Your current password will be required.',
    notificationsLink: 'Manage my notifications',
    notificationsLinkHelp: 'Choose what reaches you by email, and how often.',

    dangerTitle: 'Delete my account',
    dangerLead: 'This is permanent. It cannot be undone.',
    dangerRemoved: 'What gets deleted',
    dangerKept: 'What is kept',
    dangerConfirmLabel: 'To confirm, type',
    dangerSubmit: 'Permanently delete my account',
    dangerCancel: 'Cancel',
    dangerError: 'Could not delete the account.',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    loading: 'Loading…',
  },
};

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
