'use client';

/**
 * Boîte de dialogue accessible bâtie sur `<dialog>` natif :
 * focus trap, fermeture au clavier (Échap) et fond inerte sont gérés par le
 * navigateur, sans dépendance supplémentaire.
 */
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      className={cn(
        'm-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl bg-card p-0 shadow-2xl',
        'backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm',
        className,
      )}
      onClick={(event) => {
        // Clic sur le fond (en dehors du panneau) : fermeture.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-5">
        <div>
          <h2 id="modal-title" className="text-lg font-bold text-brand-900">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-neutral-600">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          aria-label="Fermer"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>

      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 bg-neutral-50 p-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
