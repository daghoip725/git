'use client';

/**
 * Texte long replié, avec bouton « Voir plus ».
 *
 * Le texte est **entièrement présent dans le HTML** dès le premier rendu : le
 * repli n'est qu'un effet de hauteur en CSS. Un moteur de recherche indexe donc
 * toute la description, et un utilisateur sans JavaScript la lit en entier.
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/utils/cn';

export interface CollapsibleTextProps {
  children: string;
  /** Hauteur du texte replié, en pixels. */
  collapsedHeight?: number;
  className?: string;
}

export function CollapsibleText({
  children,
  collapsedHeight = 260,
  className,
}: CollapsibleTextProps) {
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  /** Le bouton n'apparaît que si le texte dépasse réellement. */
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    // La hauteur dépend de la largeur disponible : on la réévalue au
    // redimensionnement, sinon le bouton subsiste après passage en grand écran.
    const check = () => setIsOverflowing(element.scrollHeight > collapsedHeight + 24);
    check();

    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, collapsedHeight]);

  return (
    <div className={className}>
      <div className="relative">
        <p
          ref={contentRef}
          className="leading-relaxed whitespace-pre-line text-neutral-700"
          style={
            isOverflowing && !isExpanded
              ? { maxHeight: collapsedHeight, overflow: 'hidden' }
              : undefined
          }
        >
          {children}
        </p>

        {isOverflowing && !isExpanded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent"
          />
        ) : null}
      </div>

      {isOverflowing ? (
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 text-sm font-semibold',
            'text-brand-800 underline underline-offset-2 hover:text-brand-800',
          )}
        >
          {isExpanded ? (
            <>
              Réduire
              <ChevronUp className="size-4" aria-hidden="true" />
            </>
          ) : (
            <>
              Voir la description complète
              <ChevronDown className="size-4" aria-hidden="true" />
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
