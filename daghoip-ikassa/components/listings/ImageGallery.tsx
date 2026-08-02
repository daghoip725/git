'use client';

/**
 * Galerie photo d'une annonce.
 *
 * Visuel principal, miniatures, plein écran, navigation au clavier (flèches,
 * Échap) et balayage tactile. Le plein écran s'appuie sur `<dialog>` natif :
 * le piège au focus, l'inertie de l'arrière-plan et la fermeture par Échap sont
 * fournis par le navigateur, sans dépendance ni code à maintenir.
 *
 * Seule la photo affichée est chargée en priorité ; les suivantes le sont à la
 * demande. Sur une connexion mobile gabonaise, charger huit photos pleine
 * résolution d'emblée coûterait bien plus que le confort gagné.
 */
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/utils/cn';

export interface ImageGalleryProps {
  images: { url: string; alt: string }[];
  title: string;
}

/** Distance minimale d'un balayage pour être interprété comme tel. */
const SWIPE_THRESHOLD_PX = 50;

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + images.length) % images.length);
    },
    [images.length],
  );

  // Ouverture / fermeture du plein écran, pilotées par l'état React.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isFullscreen && !dialog.open) dialog.showModal();
    else if (!isFullscreen && dialog.open) dialog.close();
  }, [isFullscreen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Échap déclenche `cancel` : on repasse par l'état plutôt que de laisser
    // le navigateur fermer le dialogue dans notre dos.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      setIsFullscreen(false);
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
  }

  function handlePointerDown(event: React.PointerEvent) {
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || images.length < 2) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Un geste plus vertical qu'horizontal est un défilement, pas un balayage.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    go(dx < 0 ? 1 : -1);
  }

  if (images.length === 0) {
    return (
      <div className="flex aspect-4/3 items-center justify-center rounded-xl bg-neutral-100 text-neutral-300">
        <ImageOff className="size-16" aria-hidden="true" />
        <span className="sr-only">Aucune photo disponible pour cette annonce</span>
      </div>
    );
  }

  const current = images[index]!;
  const hasSeveral = images.length > 1;

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-roledescription="carrousel"
        aria-label={`Photos de l’annonce « ${title} »`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="relative aspect-4/3 touch-pan-y overflow-hidden rounded-xl bg-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
      >
        <Image
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-contain"
        />

        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          aria-label="Afficher la photo en plein écran"
          className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-md transition-colors hover:bg-white"
        >
          <Expand className="size-4.5" aria-hidden="true" />
        </button>

        {hasSeveral ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Photo précédente"
              className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-md transition-colors hover:bg-white"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Photo suivante"
              className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-md transition-colors hover:bg-white"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <p
              aria-live="polite"
              className="absolute right-2 bottom-2 rounded-full bg-neutral-900/70 px-2.5 py-1 text-xs font-semibold text-white"
            >
              {index + 1} / {images.length}
            </p>
          </>
        ) : null}
      </div>

      {hasSeveral ? (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {images.map((image, imageIndex) => (
            <li key={image.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(imageIndex)}
                aria-label={`Afficher la photo ${imageIndex + 1}`}
                aria-current={imageIndex === index}
                className={cn(
                  'relative size-18 overflow-hidden rounded-lg border-2 transition-colors',
                  imageIndex === index
                    ? 'border-brand-700'
                    : 'border-transparent hover:border-neutral-300',
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="72px"
                  loading="lazy"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ----------------------------- Plein écran ----------------------------- */}
      <dialog
        ref={dialogRef}
        aria-label={`Photos de l’annonce « ${title} » en plein écran`}
        // `inset-0` + marges nulles : le dialogue occupe exactement la fenêtre.
        // `w-screen` conviendrait moins bien — il compte la barre de défilement
        // et provoquerait un débordement horizontal de quelques pixels.
        className="inset-0 m-0 h-auto max-h-none w-auto max-w-none bg-neutral-950 p-0 backdrop:bg-neutral-950/80"
        onClick={(event) => {
          // Clic hors de la photo : fermeture, comme sur une visionneuse.
          if (event.target === dialogRef.current) setIsFullscreen(false);
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {isFullscreen ? (
          <div className="relative flex h-full w-full flex-col">
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-white">
              <p className="text-sm font-semibold">
                {index + 1} / {images.length}
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => setIsFullscreen(false)}
                aria-label="Quitter le plein écran"
                className="flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 touch-pan-y">
              <Image
                src={current.url}
                alt={current.alt}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>

            {hasSeveral ? (
              <div className="flex items-center justify-center gap-3 px-4 py-4">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Photo précédente"
                  className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Photo suivante"
                  className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
