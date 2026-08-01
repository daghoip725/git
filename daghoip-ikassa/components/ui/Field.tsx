import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/utils/cn';

const CONTROL =
  'w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-neutral-900 ' +
  'placeholder:text-neutral-400 transition-colors ' +
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ' +
  'disabled:cursor-not-allowed disabled:bg-neutral-100 ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/25';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Habillage commun : libellé, aide contextuelle et message d'erreur accessible. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
        {required ? (
          <span className="text-red-600" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label: string;
  hint?: string;
  error?: string;
  /** Élément décoratif affiché à gauche du champ (icône, préfixe « FCFA »). */
  prefix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, prefix, id, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-500">
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(CONTROL, 'h-11', prefix && 'pl-16', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          required={required}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, required, rows = 6, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <FieldShell id={textareaId} label={label} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={cn(CONTROL, 'resize-y py-2.5', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        required={required}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, id, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} required={required}>
      <select
        ref={ref}
        id={selectId}
        className={cn(CONTROL, 'h-11 appearance-none bg-white pr-9', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
        required={required}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          className={cn(
            'mt-0.5 size-4.5 shrink-0 rounded border-neutral-300 text-brand-700 focus:ring-2 focus:ring-brand-500/40',
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        <label htmlFor={checkboxId} className="text-sm leading-snug text-neutral-700">
          {label}
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
