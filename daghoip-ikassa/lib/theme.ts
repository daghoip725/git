/**
 * Gestion du thème clair / sombre.
 *
 * Trois états et non deux : `system` suit le réglage du téléphone, `light` et
 * `dark` sont des choix explicites qui l'emportent. C'est important ici — un
 * utilisateur qui bascule son téléphone en sombre le soir ne veut pas que
 * l'application ignore ce réglage, mais celui qui a explicitement choisi le
 * clair ne veut pas qu'on le lui reprenne à 19 h.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

/** Clé de stockage local. Préfixée comme le reste des clés de l'application. */
export const THEME_STORAGE_KEY = 'ikassa:theme';

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Clair',
  dark: 'Sombre',
  system: 'Système',
};

/**
 * Script injecté **avant le premier rendu**, dans le `<head>`.
 *
 * Sans lui, la page s'affiche en clair puis bascule en sombre une fois React
 * hydraté : un éclair blanc en pleine nuit, exactement ce que le mode sombre
 * est censé éviter. Le script est minuscule et synchrone, donc exécuté avant
 * la peinture.
 *
 * Il est volontairement écrit en JavaScript brut et tolérant aux erreurs : un
 * navigateur qui refuse `localStorage` (navigation privée verrouillée) doit
 * afficher le site en clair, pas une page blanche.
 */
export const THEME_INIT_SCRIPT = `
(function(){try{
  var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
  var dark = stored === 'dark' || ((!stored || stored === 'system')
    && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`.trim();

/** Résout une préférence en thème effectif, côté navigateur. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applique le thème au document et mémorise la préférence. */
export function applyTheme(preference: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(preference));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Stockage indisponible : le thème s'applique quand même pour cette visite.
  }
}

/** Préférence enregistrée, `system` par défaut. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}
