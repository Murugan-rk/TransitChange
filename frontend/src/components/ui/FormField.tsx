import React from 'react';
import { AlertCircle } from 'lucide-react';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  error,
  helperText,
  required = false,
  children,
  className = '',
}) => {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className={`flex flex-col space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200"
        >
          {label}
          {required && (
            <span className="text-red-500 ml-1 font-bold" aria-hidden="true">
              *
            </span>
          )}
        </label>
      </div>

      <div className="relative">{children}</div>

      {error ? (
        <div
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 mt-1"
        >
          <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : helperText ? (
        <p
          id={helperId}
          className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
};
