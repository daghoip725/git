'use client';

/**
 * Barre de catégories du header (desktop).
 *
 * Les catégories qui ne tiennent pas sont regroupées dans un menu « Plus »
 * plutôt que tronquées : sur un site d'annonces, l'accès direct à sa rubrique
 * est le premier réflexe des visiteurs.
 */
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { CategoryIcon } from '@/components/categories/CategoryIcon';
import type { Category } from '@/types';

export interface CategoryNavProps {
  categories: Category[];
  /** Nombre de catégories affichées avant le repli dans « Plus ». */
  visibleCount?: number;
  /** Liens secondaires (Sécurité, Contact…), alignés à droite de la barre. */
  secondaryLinks?: ReadonlyArray<{ href: string; label: string }>;
}

export function CategoryNav({
  categories,
  visibleCount = 7,
  secondaryLinks = [],
}: CategoryNavProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const roots = categories.filter((category) => category.parent_id === null);
  const visible = roots.slice(0, visibleCount);
  const overflow = roots.slice(visibleCount);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (roots.length === 0) return null;

  return (
    <nav
      aria-label="Catégories"
      className="hidden border-t border-white/10 bg-brand-ink/40 lg:block"
    >
      <div className="container-app">
        <div ref={containerRef} className="relative flex items-center gap-1">
          {visible.map((category) => (
            <Link
              key={category.id}
              href={`/annonces?categorie=${category.slug}`}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CategoryIcon name={category.icon} className="size-4 shrink-0" />
              {category.name}
            </Link>
          ))}

          {overflow.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-haspopup="true"
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                Plus
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>

              {open ? (
                <div className="absolute top-full right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-card py-1.5 shadow-xl">
                  {overflow.map((category) => (
                    <Link
                      key={category.id}
                      href={`/annonces?categorie=${category.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                    >
                      <CategoryIcon name={category.icon} className="size-4 text-neutral-500" />
                      {category.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {/*
            Liens secondaires déplacés ici depuis la rangée principale : celle-ci
            accueille déjà logo, recherche, dépôt d'annonce et menu du compte, et
            débordait horizontalement une fois tous ces éléments réunis.
          */}
          {secondaryLinks.length > 0 ? (
            <div className="ml-auto flex items-center gap-1">
              {secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
