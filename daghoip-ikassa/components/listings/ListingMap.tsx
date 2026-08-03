'use client';

/**
 * Carte de repérage d'une annonce.
 *
 * Trois partis pris, tous assumés :
 *
 *  1. **Aucune bibliothèque cartographique.** Une carte de repérage se résume à
 *     une grille de tuiles et un marqueur ; `utils/map.ts` fait le calcul en
 *     une centaine de lignes, là où Leaflet ou MapLibre pèseraient plus lourd
 *     que le reste de la page réunie.
 *
 *  2. **Une zone, pas un point.** La base n'enregistre la position qu'à trois
 *     décimales (~110 m). Afficher une épingle précise mentirait sur la donnée :
 *     on dessine donc un disque d'incertitude, dimensionné à l'échelle réelle
 *     de la carte, et le texte le dit explicitement.
 *
 *  3. **Le déplacement tactile ne piège pas le défilement.** `touch-action:
 *     pan-y` laisse le navigateur faire défiler la page verticalement ; la
 *     carte ne récupère que le glissement horizontal. À la souris, les deux
 *     axes fonctionnent. Sans cela, une carte placée au milieu d'une page
 *     longue devient un mur infranchissable sur mobile.
 *
 * Les tuiles proviennent d'un service tiers (OpenStreetMap par défaut) : leur
 * chargement lui révèle l'adresse IP du visiteur. `referrerPolicy="no-referrer"`
 * évite au moins de lui transmettre l'URL de l'annonce consultée.
 */
import { ExternalLink, LocateFixed, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { publicEnv } from '@/lib/env';
import { cn } from '@/utils/cn';
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_SIZE,
  buildTileUrl,
  googleMapsLink,
  latToWorldY,
  lonToWorldX,
  metersPerPixel,
  openStreetMapLink,
} from '@/utils/map';

export interface ListingMapProps {
  latitude: number;
  longitude: number;
  /** Libellé lisible affiché sous la carte (« Nzeng-Ayong, Libreville »). */
  locationLabel: string;
}

/** Rayon du disque d'incertitude, en mètres. */
const UNCERTAINTY_RADIUS_M = 400;

interface Size {
  width: number;
  height: number;
}

export function ListingMap({ latitude, longitude, locationLabel }: ListingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  /** Décalage appliqué par l'utilisateur, en pixels écran. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  // Le calcul des tuiles a besoin des dimensions réelles du conteneur.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setZoom((current) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + delta)));
    // Le zoom recentre sur l'annonce : c'est le comportement attendu d'une
    // carte de repérage, où le sujet est toujours le bien.
    setOffset({ x: 0, y: 0 });
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.startX = event.clientX;
    drag.startY = event.clientY;

    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }

  /** Déplacement au clavier : la carte reste utilisable sans souris. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = 60;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setOffset((current) => ({ x: current.x + move.x, y: current.y + move.y }));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      changeZoom(1);
    }
    if (event.key === '-') {
      event.preventDefault();
      changeZoom(-1);
    }
  }

  // --- Géométrie ------------------------------------------------------------
  const centerX = lonToWorldX(longitude, zoom);
  const centerY = latToWorldY(latitude, zoom);

  // Coin supérieur gauche de la fenêtre, en pixels monde.
  const originX = centerX - size.width / 2 - offset.x;
  const originY = centerY - size.height / 2 - offset.y;

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  if (size.width > 0 && size.height > 0) {
    const firstTileX = Math.floor(originX / TILE_SIZE);
    const firstTileY = Math.floor(originY / TILE_SIZE);
    const lastTileX = Math.floor((originX + size.width) / TILE_SIZE);
    const lastTileY = Math.floor((originY + size.height) / TILE_SIZE);

    for (let x = firstTileX; x <= lastTileX; x += 1) {
      for (let y = firstTileY; y <= lastTileY; y += 1) {
        const url = buildTileUrl(publicEnv.NEXT_PUBLIC_MAP_TILE_URL, x, y, zoom);
        if (!url) continue;
        tiles.push({
          key: `${zoom}/${x}/${y}`,
          url,
          left: x * TILE_SIZE - originX,
          top: y * TILE_SIZE - originY,
        });
      }
    }
  }

  const markerLeft = size.width / 2 + offset.x;
  const markerTop = size.height / 2 + offset.y;
  const radiusPx = UNCERTAINTY_RADIUS_M / metersPerPixel(latitude, zoom);
  const isMoved = offset.x !== 0 || offset.y !== 0;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
        <div
          ref={containerRef}
          role="application"
          aria-label={`Carte de repérage : ${locationLabel}. Flèches pour déplacer, plus et moins pour zoomer.`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyDown}
          className="relative h-64 w-full cursor-grab touch-pan-y select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-800 active:cursor-grabbing sm:h-80"
        >
          {tiles.map((tile) => (
            // Tuiles servies telles quelles : les faire passer par
            // l'optimiseur d'images de Next.js n'apporterait rien et
            // ouvrirait son proxy à un hôte tiers.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              draggable={false}
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute max-w-none"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}

          {/* Disque d'incertitude : la donnée vaut ~110 m, on ne prétend pas
              mieux. Le centre reste marqué pour l'orientation. */}
          {size.width > 0 ? (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute rounded-full border-2 border-brand-800/70 bg-brand-600/20"
                style={{
                  left: markerLeft - radiusPx,
                  top: markerTop - radiusPx,
                  width: radiusPx * 2,
                  height: radiusPx * 2,
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-700 shadow"
                style={{ left: markerLeft, top: markerTop }}
              />
            </>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-white/80 to-transparent px-2 py-1">
            <p className="text-[10px] text-neutral-700">{publicEnv.NEXT_PUBLIC_MAP_ATTRIBUTION}</p>
          </div>
        </div>

        {/* Commandes hors du conteneur déplaçable : un clic sur « + » ne doit
            pas démarrer un glissement. */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <MapControl
            label="Zoomer"
            onClick={() => changeZoom(1)}
            disabled={zoom >= MAX_ZOOM}
            icon={<Plus className="size-4" aria-hidden="true" />}
          />
          <MapControl
            label="Dézoomer"
            onClick={() => changeZoom(-1)}
            disabled={zoom <= MIN_ZOOM}
            icon={<Minus className="size-4" aria-hidden="true" />}
          />
          {isMoved ? (
            <MapControl
              label="Recentrer sur l’annonce"
              onClick={() => setOffset({ x: 0, y: 0 })}
              icon={<LocateFixed className="size-4" aria-hidden="true" />}
            />
          ) : null}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Zone approximative — la position est arrondie à environ 110 mètres, l’adresse exacte n’est
        jamais publiée.
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a
          href={openStreetMapLink(latitude, longitude, zoom)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-brand-800 underline underline-offset-2 hover:text-brand-800"
        >
          Voir sur OpenStreetMap
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <a
          href={googleMapsLink(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-brand-800 underline underline-offset-2 hover:text-brand-800"
        >
          Itinéraire
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

interface MapControlProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}

function MapControl({ label, onClick, icon, disabled }: MapControlProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-8 items-center justify-center rounded-md border border-neutral-300 bg-card/95 text-neutral-700 shadow-sm transition-colors',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-card hover:text-brand-800',
      )}
    >
      {icon}
    </button>
  );
}
