import 'server-only';

/**
 * Fabrique des images de partage (Open Graph).
 *
 * Pourquoi cela vaut le détour : au Gabon, une annonce se partage sur WhatsApp.
 * L'aperçu qui s'affiche dans la conversation **est** l'annonce, pour la
 * personne qui la reçoit. Y montrer un logo carré, comme c'était le cas, revient
 * à envoyer une enveloppe vide.
 *
 * Contraintes du moteur de rendu (Satori, derrière `next/og`) — elles expliquent
 * la forme du code, qui ne ressemble pas au reste de l'interface :
 *
 *  - **flexbox uniquement**. Pas de `grid`, pas de `position: absolute` fiable.
 *    Chaque conteneur porte un `display: flex` explicite, y compris quand il
 *    n'a qu'un enfant : Satori l'exige.
 *  - **pas de classes Tailwind** : les styles sont écrits en ligne.
 *  - **pas de police du système** : le rendu se fait hors navigateur. On s'en
 *    remet à la police par défaut de `next/og`, ce qui interdit les fantaisies
 *    typographiques mais évite d'embarquer un fichier de police de 300 ko.
 */
import { ImageResponse } from 'next/og';

import { BRAND_COLORS, SITE } from '@/utils/constants';

/** Format standard des aperçus : 1200×630. WhatsApp, Facebook et X s'y calent. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

export interface OgCardOptions {
  /** Titre principal, tronqué à l'affichage. */
  title: string;
  /** Ligne mise en avant : prix, nombre d'annonces… */
  highlight?: string | null;
  /** Contexte : ville, catégorie, note. */
  subtitle?: string | null;
  /**
   * Photo de couverture. Absente, la carte reste lisible — elle est même
   * pensée pour cela : une annonce sans photo doit produire un aperçu correct,
   * pas un trou.
   */
  imageUrl?: string | null;
  /** Étiquette d'angle : « Annonce vérifiée », « Vendeur pro »… */
  badge?: string | null;
}

/** Coupe sans laisser un mot à moitié. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Carte de partage commune à toutes les pages.
 *
 * Une seule fabrique plutôt qu'une par type de page : trois gabarits proches
 * auraient divergé au premier ajustement, et un aperçu incohérent d'une page à
 * l'autre se remarque immédiatement dans un fil de discussion.
 */
export function renderOgCard({
  title,
  highlight,
  subtitle,
  imageUrl,
  badge,
}: OgCardOptions): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BRAND_COLORS.primary,
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Colonne texte : elle occupe toute la largeur quand il n'y a pas de
            photo, la moitié sinon. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 56,
          width: imageUrl ? '58%' : '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: BRAND_COLORS.gold,
              }}
            />
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
              {SITE.name}
            </div>
          </div>

          {badge ? (
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                alignSelf: 'flex-start',
                backgroundColor: BRAND_COLORS.gold,
                color: '#073d27',
                fontSize: 20,
                fontWeight: 700,
                padding: '6px 16px',
                borderRadius: 999,
              }}
            >
              {badge}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              marginTop: badge ? 20 : 36,
              fontSize: title.length > 60 ? 48 : 58,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: -1,
            }}
          >
            {truncate(title, 90)}
          </div>

          {highlight ? (
            <div
              style={{
                display: 'flex',
                marginTop: 24,
                fontSize: 44,
                fontWeight: 800,
                color: BRAND_COLORS.gold,
              }}
            >
              {highlight}
            </div>
          ) : null}

          {subtitle ? (
            <div
              style={{
                display: 'flex',
                marginTop: 14,
                fontSize: 28,
                color: 'rgba(255,255,255,0.78)',
              }}
            >
              {truncate(subtitle, 70)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.6)' }}>
          {SITE.tagline}
        </div>
      </div>

      {imageUrl ? (
        <div style={{ display: 'flex', width: '42%', height: '100%' }}>
          {/*
              `next/og` ne connaît pas `next/image` : c'est une balise `img`
              brute, et l'URL doit être absolue et publiquement accessible.

              Limite mesurée et assumée : dans Satori, une `<img>` qui remplit
              son conteneur **remplace** le fond de celui-ci au lieu de s'y
              composer — une couleur de fond ne protège donc pas d'une photo
              transparente, et `background-image` avec une URL distante n'est
              pas rendue du tout. Une photo à fond transparent (un logo déposé
              comme photo d'annonce) apparaîtra donc sur fond clair chez le
              destinataire. Le cas est rare — les photos viennent d'appareils
              photo — et l'aperçu reste lisible.
            */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            width={504}
            height={630}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : null}
    </div>,
    OG_SIZE,
  );
}
