'use client';

/**
 * Galerie photo d'une annonce : visuel principal + miniatures, navigation au
 * clavier (flèches gauche/droite) et repli si aucune photo n'est disponible.
 */
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useState } from 'react';

import { cn } from '@/utils/cn';

export interface ImageGalleryProps {
  images: { url: string; alt: string }[];
  title: string;
}

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + images.length) % images.length);
    },
    [images.length],
  );

  if (images.length === 0) {
    return (
      <div className="flex aspect-4/3 items-center justify-center rounded-xl bg-neutral-100 text-neutral-300">
        <ImageOff className="size-16" aria-hidden="true" />
        <span className="sr-only">Aucune photo disponible pour cette annonce</span>
      </div>
    );
  }

  const current = images[index]!;

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-roledescription="carrousel"
        aria-label={`Photos de l’annonce « ${title} »`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') go(1);
          if (event.key === 'ArrowLeft') go(-1);
        }}
        className="relative aspect-4/3 overflow-hidden rounded-xl bg-neutral-100"
      >
        <Image
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-contain"
        />

        {images.length > 1 ? (
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

      {images.length > 1 ? (
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
                <Image src={image.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
